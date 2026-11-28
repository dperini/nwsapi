use super::{
    class_matches_value, has_match, Handle, LiveNavigator, Navigator, NodeType, PreparedList,
    RelativeSelector, ScopedNavigator, SelectorError, SelectorExtensions, Tree,
};
use std::rc::Rc;

/// A validated DOM selector list that can be reused across roots and trees.
///
/// The plan retains selector data and may request native code on repeat use.
/// It reads the live tree each time it runs.
#[derive(Clone)]
pub struct CompiledSelector(pub(super) Rc<PreparedList>);

/// A compiled relative selector list for an existence query anchored at an element.
#[derive(Clone)]
pub struct CompiledRelativeSelector(pub(super) Rc<[RelativeSelector]>);

impl CompiledRelativeSelector {
    /// Return whether any relative selector has a witness from the anchor.
    #[must_use]
    pub fn exists(&self, tree: &Tree, anchor: Handle) -> bool {
        tree.is_live(anchor)
            && tree.node_type(anchor) == NodeType::Element
            && self
                .0
                .iter()
                .any(|selector| has_match(&LiveNavigator(tree), anchor, selector))
    }
}

impl CompiledSelector {
    pub(super) fn select_in_shadow(&self, tree: &Tree, root: Handle) -> Vec<Handle> {
        self.0.select_in_shadow(tree, root)
    }

    pub(super) fn first_in_shadow(&self, tree: &Tree, root: Handle) -> Option<Handle> {
        self.0.first_in_shadow(tree, root)
    }

    /// Test whether the root has a matching descendant.
    #[must_use]
    pub fn exists(&self, tree: &Tree, root: Option<Handle>) -> bool {
        self.first(tree, root).is_some()
    }

    /// Select matches in document order below the supplied root.
    /// With no root, select from the document.
    #[must_use]
    pub fn select(&self, tree: &Tree, root: Option<Handle>) -> Vec<Handle> {
        self.0
            .select_from(tree, root.unwrap_or_else(|| tree.root()))
    }

    /// Select until the callback returns false. The stopping node is included.
    pub fn select_with(
        &self,
        tree: &Tree,
        root: Option<Handle>,
        mut callback: impl FnMut(Handle) -> bool,
    ) -> Vec<Handle> {
        let root = root.unwrap_or_else(|| tree.root());
        let scope = (tree.node_type(root) == NodeType::Element).then_some(root);
        let mut result = Vec::new();
        self.0.visit_selected(tree, root, scope, None, |node| {
            result.push(node);
            !callback(node)
        });
        result
    }

    /// Return the first matching descendant of the supplied root.
    #[must_use]
    pub fn first(&self, tree: &Tree, root: Option<Handle>) -> Option<Handle> {
        let root = root.unwrap_or_else(|| tree.root());
        let scope = (tree.node_type(root) == NodeType::Element).then_some(root);
        self.0.first_from(tree, root, scope)
    }

    /// Return the first match and call the callback once if one exists.
    pub fn first_with(
        &self,
        tree: &Tree,
        root: Option<Handle>,
        callback: impl FnOnce(Handle),
    ) -> Option<Handle> {
        self.first(tree, root).inspect(|&node| callback(node))
    }

    /// Return whether the node matches. The node is the `:scope` element.
    #[must_use]
    pub fn matches(&self, tree: &Tree, node: Handle) -> bool {
        self.0.matches(tree, node, Some(node))
    }

    /// Call the callback once for each matching alternative in the selector list.
    pub fn matches_with(&self, tree: &Tree, node: Handle, callback: impl FnMut(Handle)) -> bool {
        self.matches_arms(tree, node, node, callback)
    }

    /// Return the nearest inclusive matching ancestor.
    #[must_use]
    pub fn closest(&self, tree: &Tree, node: Handle) -> Option<Handle> {
        self.0.closest_from(tree, node)
    }

    /// Find the nearest matching ancestor and report each matching alternative for it.
    pub fn closest_with(
        &self,
        tree: &Tree,
        node: Handle,
        mut callback: impl FnMut(Handle),
    ) -> Option<Handle> {
        let mut current = Some(node);
        while let Some(element) = current.filter(|&h| tree.node_type(h) == NodeType::Element) {
            if self.matches_arms(tree, element, node, &mut callback) {
                return Some(element);
            }
            current = tree.parent(element);
        }
        None
    }

    fn matches_arms(
        &self,
        tree: &Tree,
        node: Handle,
        scope: Handle,
        mut callback: impl FnMut(Handle),
    ) -> bool {
        let nav = ScopedNavigator {
            live: LiveNavigator(tree),
            scope,
            shadow_scope: None,
        };
        let mut matched = false;
        for index in 0..self.0.selectors.len() {
            if self.0.matches_arm(&nav, node, index) {
                callback(node);
                matched = true;
            }
        }
        matched
    }
}

/// Target for the element traversal helpers.
#[derive(Clone, Copy)]
pub enum TraversalTarget<'a> {
    /// A zero-based position in the traversal.
    Index(usize),
    /// The first candidate matching a compiled selector.
    Selector(&'a CompiledSelector),
}

impl TraversalTarget<'_> {
    fn matches(self, tree: &Tree, node: Handle, index: usize) -> bool {
        match self {
            Self::Index(target) => index == target,
            Self::Selector(selector) => selector.matches(tree, node),
        }
    }
}

impl Tree {
    /// Compile a relative selector list for an existence query, with `:has()` syntax.
    ///
    /// # Errors
    ///
    /// Returns a selector syntax error if the relative selector list is invalid.
    pub fn compile_relative_selector(
        &self,
        source: &str,
    ) -> Result<CompiledRelativeSelector, SelectorError> {
        SelectorExtensions::default()
            .compile_relative_with_forgiving(source, self.selector_config.forgiving)
    }

    /// Validate and prepare a DOM selector for reuse across multiple queries.
    ///
    /// # Errors
    ///
    /// Returns the same syntax error as the checked selector APIs.
    pub fn compile_selector(&self, source: &str) -> Result<CompiledSelector, SelectorError> {
        self.validate_selector(source)?;
        Ok(CompiledSelector(self.parse_selector_cached(source)))
    }

    /// Prepare a DOM selector and preserve its original UTF-16 code units.
    ///
    /// # Errors
    ///
    /// Returns a selector syntax error. Validation projects unpaired units to
    /// U+FFFD, while the actual matcher retains the original units.
    pub fn compile_selector_units(
        &self,
        source: &[u16],
    ) -> Result<CompiledSelector, SelectorError> {
        self.validate_selector(&String::from_utf16_lossy(source))?;
        Ok(CompiledSelector(self.parse_units_cached(source)))
    }

    /// Find an ancestor, starting at the parent element.
    #[must_use]
    pub fn up(&self, node: Handle, target: TraversalTarget<'_>) -> Option<Handle> {
        self.walk_elements(node, target, |node| {
            self.parent(node)
                .filter(|&parent| self.node_type(parent) == NodeType::Element)
        })
    }

    /// Find a following element sibling, starting at the adjacent element.
    #[must_use]
    pub fn next(&self, node: Handle, target: TraversalTarget<'_>) -> Option<Handle> {
        let nav = LiveNavigator(self);
        self.walk_elements(node, target, |node| nav.next_element_sibling(node))
    }

    /// Find a preceding element sibling, starting at the adjacent element.
    #[must_use]
    pub fn previous(&self, node: Handle, target: TraversalTarget<'_>) -> Option<Handle> {
        let nav = LiveNavigator(self);
        self.walk_elements(node, target, |node| nav.previous_element_sibling(node))
    }

    /// Find the first direct element child when no target is supplied.
    /// With a target, search the starting element and descendants in document order.
    #[must_use]
    pub fn down(&self, node: Handle, target: Option<TraversalTarget<'_>>) -> Option<Handle> {
        let mut found = None;
        if let Some(target) = target {
            if target.matches(self, node, 0) {
                return Some(node);
            }
            let mut index = 0;
            self.some_descendant(node, |candidate| {
                index += 1;
                if !target.matches(self, candidate, index) {
                    return false;
                }
                found = Some(candidate);
                true
            });
        } else {
            self.some_element_child(node, |child| {
                found = Some(child);
                true
            });
        }
        found
    }

    fn walk_elements(
        &self,
        node: Handle,
        target: TraversalTarget<'_>,
        mut step: impl FnMut(Handle) -> Option<Handle>,
    ) -> Option<Handle> {
        let mut current = node;
        for index in 0.. {
            current = step(current)?;
            if target.matches(self, current, index) {
                return Some(current);
            }
        }
        None
    }

    /// Find descendants containing every CSS whitespace-delimited class token.
    #[must_use]
    pub fn by_class(&self, root: Option<Handle>, classes: &str) -> Vec<Handle> {
        let tokens: Vec<_> = classes
            .split([' ', '\t', '\n', '\r', '\x0c'])
            .filter(|token| !token.is_empty())
            .collect();
        if tokens.is_empty() {
            return Vec::new();
        }
        let mut result = Vec::new();
        self.some_descendant(root.unwrap_or_else(|| self.root()), |node| {
            if self
                .get_attribute_ns_borrowed(node, None, "class")
                .is_some_and(|value| {
                    tokens
                        .iter()
                        .all(|class| class_matches_value(self, node, value, class))
                })
            {
                result.push(node);
            }
            false
        });
        result
    }

    /// Find descendants by literal ID in document order.
    /// By default, this includes duplicate IDs.
    #[must_use]
    pub fn by_id(&self, root: Option<Handle>, id: &str) -> Vec<Handle> {
        let mut result = Vec::new();
        self.some_descendant(root.unwrap_or_else(|| self.root()), |node| {
            if self.get_attribute_ns_borrowed(node, None, "id") == Some(id)
                && self.attribute_is_scalar(node, "id")
            {
                result.push(node);
                return !self.selector_config.ids_dupes;
            }
            false
        });
        result
    }

    /// Find descendants by local tag name, or all descendant elements for `*`.
    #[must_use]
    pub fn by_tag(&self, root: Option<Handle>, tag: &str) -> Vec<Handle> {
        let mut result = Vec::new();
        let xml_document = self.host_document == Some(super::HostDocumentKind::Xml);
        self.some_descendant(root.unwrap_or_else(|| self.root()), |node| {
            if tag == "*"
                || self.local_name_scalar(node).is_some_and(|name| {
                    if xml_document {
                        name == tag
                    } else {
                        name.eq_ignore_ascii_case(tag)
                    }
                })
            {
                result.push(node);
            }
            false
        });
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_reuse_live_trees_scopes_and_callback_semantics() {
        let mut tree = Tree::parse("<main><p id=dup class='x y'></p><p id=dup class=x></p></main>");
        let root = tree.query_selector("main").unwrap();
        let nodes = tree.by_id(Some(root), "dup");
        let selector = tree.compile_selector(":scope > .x").unwrap();
        assert_eq!(selector.select(&tree, Some(root)), nodes);
        assert_eq!(selector.first(&tree, Some(root)), Some(nodes[0]));
        assert_eq!(
            selector.select_with(&tree, Some(root), |_| false),
            [nodes[0]]
        );
        assert_eq!(tree.by_class(Some(root), "x\ty"), [nodes[0]]);
        assert_eq!(tree.by_tag(Some(root), "P"), nodes);

        let both = tree.compile_selector(".x, p").unwrap();
        let mut reported = Vec::new();
        assert!(both.matches_with(&tree, nodes[0], |node| reported.push(node)));
        assert_eq!(reported, [nodes[0], nodes[0]]);
        reported.clear();
        assert_eq!(
            both.closest_with(&tree, nodes[0], |node| reported.push(node)),
            Some(nodes[0])
        );
        assert_eq!(reported, [nodes[0], nodes[0]]);

        tree.set_attribute(nodes[0], "class", "removed");
        assert_eq!(selector.select(&tree, Some(root)), [nodes[1]]);
        let other = Tree::parse("<main><p class=x></p></main>");
        let other_root = other.query_selector("main").unwrap();
        assert_eq!(selector.select(&other, Some(other_root)).len(), 1);
        assert!(tree.compile_selector(".x > > p").is_err());
    }

    #[test]
    fn html_quirks_class_selectors_and_lookups_ignore_ascii_case() {
        let quirks = Tree::parse(
            "<main><p class='MiXeD token'></p><p class='other'></p><svg><g class='MiXeD'></g></svg></main>",
        );
        assert_eq!(quirks.compat_mode(), "BackCompat");
        let root = quirks.query_selector("main").unwrap();
        let mixed = quirks.query_selector("p").unwrap();
        let svg = quirks.query_selector("svg > g").unwrap();
        assert_eq!(&*quirks.query_selector_all(".mixed"), [mixed, svg]);
        assert_eq!(quirks.by_class(Some(root), "MIXED"), [mixed, svg]);
        assert_eq!(quirks.by_class(Some(root), "MIXED TOKEN"), [mixed]);

        let standards = Tree::parse("<!doctype html><main><p class='MiXeD token'></p></main>");
        let root = standards.query_selector("main").unwrap();
        assert_eq!(&*standards.query_selector_all(".mixed"), []);
        assert_eq!(standards.by_class(Some(root), "MIXED"), []);
    }

    #[test]
    fn template_content_fragments_do_not_leak_into_structural_selectors() {
        let tree = Tree::parse(
            "<main><template id=template><span id=inert></span></template><p id=first></p><p id=second></p></main>",
        );
        let template = tree.get_element_by_id("template").unwrap();
        let first = tree.get_element_by_id("first").unwrap();
        let second = tree.get_element_by_id("second").unwrap();

        assert!(tree.matches(template, ":empty"));
        assert!(tree.matches(template, ":first-child"));
        assert!(!tree.matches(template, ":parent"));
        assert_eq!(&*tree.query_selector_all("#inert"), []);
        assert_eq!(&*tree.query_selector_all("main > :nth-child(2)"), [first]);
        assert!(tree.matches(first, ":nth-child(2)"));
        assert!(!tree.matches(second, ":nth-child(2)"));
    }

    #[test]
    fn traversal_skips_non_elements_and_uses_candidate_scope() {
        use TraversalTarget::{Index, Selector};
        let tree = Tree::parse("<main>text<section><p></p></section>text<aside></aside></main>");
        let main = tree.query_selector("main").unwrap();
        let section = tree.query_selector("section").unwrap();
        let paragraph = tree.query_selector("p").unwrap();
        let aside = tree.query_selector("aside").unwrap();
        let scoped = tree.compile_selector("p:scope").unwrap();
        assert_eq!(tree.down(main, None), Some(section));
        assert_eq!(tree.down(main, Some(Index(0))), Some(main));
        assert_eq!(tree.down(main, Some(Index(3))), Some(aside));
        assert_eq!(tree.down(main, Some(Selector(&scoped))), Some(paragraph));
        assert_eq!(tree.up(paragraph, Index(1)), Some(main));
        assert_eq!(tree.next(section, Index(0)), Some(aside));
        assert_eq!(tree.previous(aside, Index(0)), Some(section));
        assert_eq!(tree.previous(section, Index(0)), None);
    }

    #[test]
    fn by_tag_is_case_sensitive_for_xml_and_ascii_insensitive_for_html() {
        let mut tree = Tree::parse("");
        tree.host_document = Some(super::super::HostDocumentKind::Xml);
        let root = tree.create_element_namespace(Some("urn:test"), "root");
        let upper = tree.create_element_namespace(Some("urn:test"), "Item");
        let lower = tree.create_element_namespace(Some("urn:test"), "item");
        tree.append_child(tree.root(), root);
        tree.append_child(root, upper);
        tree.append_child(root, lower);
        assert_eq!(tree.by_tag(None, "Item"), [upper]);
        assert_eq!(tree.by_tag(None, "item"), [lower]);
        assert_eq!(tree.by_tag(None, "ITEM"), []);

        let html = Tree::parse("<main><p></p></main>");
        assert_eq!(html.by_tag(None, "P").len(), 1);
    }

    #[test]
    fn heading_matches_only_requested_html_levels() {
        let mut tree = Tree::parse("<main><h1></h1><h2></h2><h6></h6></main>");
        let main = tree.query_selector("main").unwrap();
        let foreign = tree.create_element_ns("h1", crate::rtdom::tree::Namespace::Svg);
        tree.append_child(main, foreign);
        assert_eq!(
            tree.query_selector_all_checked(":heading").unwrap().len(),
            3
        );
        let plan = tree
            .compile_selector(":heading(+01, 6, -2, 1000000000000000000000)")
            .unwrap();
        assert_eq!(
            plan.select(&tree, None),
            tree.query_selector_all("h1, h6")
                .iter()
                .copied()
                .filter(|&node| node != foreign)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            tree.query_selector_all_from_units(
                main,
                &":heading(2)".encode_utf16().collect::<Vec<_>>()
            ),
            tree.query_selector_all("h2")
        );
        assert!(tree.compile_selector(":heading(2,)").is_err());
        assert!(tree.compile_selector(":heading(2.0)").is_err());
    }

    #[test]
    fn open_and_closed_read_live_details_and_dialog_state() {
        let mut tree = Tree::parse("<details open></details><dialog></dialog><div open></div>");
        let details = tree.query_selector("details").unwrap();
        let dialog = tree.query_selector("dialog").unwrap();
        let open = tree.compile_selector(":open").unwrap();
        let closed = tree.compile_selector(":closed").unwrap();
        assert_eq!(open.select(&tree, None), [details]);
        assert_eq!(closed.select(&tree, None), [dialog]);
        tree.remove_attribute(details, "open");
        tree.set_attribute(dialog, "open", "");
        assert_eq!(open.select(&tree, None), [dialog]);
        assert_eq!(closed.select(&tree, None), [details]);
    }

    #[test]
    fn compiled_utf16_keeps_unpaired_attribute_values() {
        let mut tree = Tree::parse("<p id=one></p><p id=two></p>");
        let one = tree.get_element_by_id("one").unwrap();
        let two = tree.get_element_by_id("two").unwrap();
        tree.set_attribute_utf16(one, "title", &[0xd800]);
        tree.set_attribute_utf16(two, "title", &[0xd801]);
        let mut source: Vec<_> = "[title=\"".encode_utf16().collect();
        source.extend([0xd800, u16::from(b'"'), u16::from(b']')]);
        let selector = tree.compile_selector_units(&source).unwrap();
        assert_eq!(selector.select(&tree, None), [one]);
        assert!(!selector.matches(&tree, two));
    }
}
