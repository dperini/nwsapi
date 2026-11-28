//! Ergonomic read-only façade over the handle-based [`Tree`] (`RUST_PORT_PLAN` §7).
//!
//! Threading `(tree, handle)` pairs through call sites is noisy. [`NodeRef`] bundles
//! a `&Tree` with a [`Handle`] so a consumer can write chained navigation/queries:
//!
//! ```ignore
//! let id = tree.query("div.card")?.get_attribute("id");
//! ```
//!
//! `NodeRef` is `Copy` (a shared reference + a `u32`) — no ownership, no clones needed.
//! It is a thin, allocation-light wrapper that ONLY calls the existing public `Tree`
//! API; it never reaches into `Tree` internals and never mutates.
//!
//! Scoping note: [`Tree::query_selector`]/[`Tree::query_selector_all`] are
//! DOCUMENT-scoped. [`NodeRef::query_selector`]/[`NodeRef::query_selector_all`] are
//! DESCENDANT-scoped — they run the document query and keep only matches whose
//! ancestor chain passes through `self` (matching the DOM `Element.querySelector*`
//! contract, where the context node itself is excluded and only descendants count).

use crate::rtdom::tree::{Handle, NodeType, Tree};

/// A read-only cursor over one node of a [`Tree`].
///
/// Holds a borrowed `&Tree` plus the node's [`Handle`]; cheap to copy and pass by value.
#[derive(Clone, Copy)]
pub struct NodeRef<'a> {
    tree: &'a Tree,
    handle: Handle,
}

impl<'a> NodeRef<'a> {
    /// Bind a handle to its tree.
    #[inline]
    pub fn new(tree: &'a Tree, handle: Handle) -> NodeRef<'a> {
        NodeRef { tree, handle }
    }

    /// The underlying node handle.
    #[inline]
    #[must_use]
    pub fn handle(&self) -> Handle {
        self.handle
    }

    /// The tree this node belongs to.
    #[inline]
    #[must_use]
    pub fn tree(&self) -> &'a Tree {
        self.tree
    }

    // ------------------------------------------------------------------ reads

    /// `tagName` (uppercased for HTML-namespace elements). `None` for non-elements.
    #[must_use]
    pub fn tag_name(&self) -> Option<String> {
        self.tree.tag_name(self.handle)
    }

    /// `localName` (lowercase as parsed). `None` for non-elements.
    #[must_use]
    pub fn local_name(&self) -> Option<&'a str> {
        self.tree.local_name(self.handle)
    }

    /// `nodeType` (e.g. `NodeType::Element`, `NodeType::Text`).
    #[must_use]
    pub fn node_type(&self) -> NodeType {
        self.tree.node_type(self.handle)
    }

    /// Attribute value by name, or `None` if absent.
    #[must_use]
    pub fn get_attribute(&self, name: &str) -> Option<&'a str> {
        self.tree.get_attribute(self.handle, name)
    }

    /// Whether the named attribute is present.
    #[must_use]
    pub fn has_attribute(&self, name: &str) -> bool {
        self.tree.has_attribute(self.handle, name)
    }

    /// All attributes as `(name, value)` pairs.
    #[must_use]
    pub fn attributes(&self) -> Vec<(String, String)> {
        self.tree.attributes(self.handle)
    }

    /// Concatenated descendant text.
    #[must_use]
    pub fn text_content(&self) -> String {
        self.tree.text_content(self.handle)
    }

    // ------------------------------------------------------------- navigation

    /// Parent node, if any.
    #[must_use]
    pub fn parent(&self) -> Option<NodeRef<'a>> {
        self.tree.parent(self.handle).map(|h| self.wrap(h))
    }

    /// All child nodes (every node type), in order.
    #[must_use]
    pub fn children(&self) -> Vec<NodeRef<'a>> {
        self.tree
            .children(self.handle)
            .into_iter()
            .map(|h| self.wrap(h))
            .collect()
    }

    /// First child node (any type), if any.
    #[must_use]
    pub fn first_child(&self) -> Option<NodeRef<'a>> {
        self.tree.first_child(self.handle).map(|h| self.wrap(h))
    }

    /// Last child node (any type), if any.
    #[must_use]
    pub fn last_child(&self) -> Option<NodeRef<'a>> {
        self.tree.last_child(self.handle).map(|h| self.wrap(h))
    }

    /// Next sibling node (any type), if any.
    #[must_use]
    pub fn next_sibling(&self) -> Option<NodeRef<'a>> {
        self.tree.next_sibling(self.handle).map(|h| self.wrap(h))
    }

    /// Previous sibling node (any type), if any.
    #[must_use]
    pub fn previous_sibling(&self) -> Option<NodeRef<'a>> {
        self.tree
            .previous_sibling(self.handle)
            .map(|h| self.wrap(h))
    }

    /// First child that is an element.
    #[must_use]
    pub fn first_element_child(&self) -> Option<NodeRef<'a>> {
        for h in self.tree.children(self.handle) {
            if self.tree.node_type(h) == NodeType::Element {
                return Some(self.wrap(h));
            }
        }
        None
    }

    /// Last child that is an element.
    #[must_use]
    pub fn last_element_child(&self) -> Option<NodeRef<'a>> {
        let kids = self.tree.children(self.handle);
        for h in kids.into_iter().rev() {
            if self.tree.node_type(h) == NodeType::Element {
                return Some(self.wrap(h));
            }
        }
        None
    }

    /// Next sibling that is an element.
    #[must_use]
    pub fn next_element_sibling(&self) -> Option<NodeRef<'a>> {
        self.tree
            .next_element_sibling(self.handle)
            .map(|h| self.wrap(h))
    }

    /// Previous sibling that is an element.
    #[must_use]
    pub fn previous_element_sibling(&self) -> Option<NodeRef<'a>> {
        self.tree
            .previous_element_sibling(self.handle)
            .map(|h| self.wrap(h))
    }

    // ---------------------------------------------------------------- queries

    /// Whether this node matches the selector.
    #[must_use]
    pub fn matches(&self, selector: &str) -> bool {
        self.tree.matches(self.handle, selector)
    }

    /// First DESCENDANT matching `selector` (the context node itself is excluded).
    #[must_use]
    pub fn query_selector(&self, selector: &str) -> Option<NodeRef<'a>> {
        if !self.in_document() || mentions_scope(selector) {
            return self
                .tree
                .descendants(self.handle)
                .into_iter()
                .find(|&h| self.tree.matches_scoped(h, selector, self.handle))
                .map(|h| self.wrap(h));
        }
        self.tree
            .query_selector_from(self.handle, selector, None)
            .map(|h| self.wrap(h))
    }

    /// All DESCENDANTS matching `selector` (the context node itself is excluded).
    #[must_use]
    pub fn query_selector_all(&self, selector: &str) -> Vec<NodeRef<'a>> {
        if !self.in_document() || mentions_scope(selector) {
            return self
                .tree
                .descendants(self.handle)
                .into_iter()
                .filter(|&h| self.tree.matches_scoped(h, selector, self.handle))
                .map(|h| self.wrap(h))
                .collect();
        }
        self.tree
            .query_selector_all(selector)
            .iter()
            .copied()
            .filter(|&h| self.is_descendant(h))
            .map(|h| self.wrap(h))
            .collect()
    }

    // ----------------------------------------------------------------- internals

    #[inline]
    fn wrap(&self, h: Handle) -> NodeRef<'a> {
        NodeRef::new(self.tree, h)
    }

    // Document query caches contain only the connected light tree. Detached
    // elements/fragments/shadow roots need their own subtree traversal.
    fn in_document(&self) -> bool {
        let mut top = self.handle;
        while let Some(parent) = self.tree.parent(top) {
            top = parent;
        }
        top == self.tree.root()
    }

    /// Is `h` a strict descendant of `self.handle` (walking parents to the root)?
    fn is_descendant(&self, h: Handle) -> bool {
        if h == self.handle {
            return false;
        }
        let mut cur = self.tree.parent(h);
        while let Some(p) = cur {
            if p == self.handle {
                return true;
            }
            cur = self.tree.parent(p);
        }
        false
    }
}

/// Façade entry points on a [`Tree`] that hand back [`NodeRef`]s.
pub trait DocumentExt {
    /// The document root as a [`NodeRef`].
    fn document(&self) -> NodeRef<'_>;
    /// Wrap an arbitrary handle.
    fn node(&self, h: Handle) -> NodeRef<'_>;
    /// Document-scoped first match (delegates to [`Tree::query_selector`]).
    fn query(&self, sel: &str) -> Option<NodeRef<'_>>;
    /// Document-scoped all matches (delegates to [`Tree::query_selector_all`]).
    fn query_all(&self, sel: &str) -> Vec<NodeRef<'_>>;
}

impl DocumentExt for Tree {
    fn document(&self) -> NodeRef<'_> {
        NodeRef::new(self, self.root())
    }

    fn node(&self, h: Handle) -> NodeRef<'_> {
        NodeRef::new(self, h)
    }

    fn query(&self, sel: &str) -> Option<NodeRef<'_>> {
        self.query_selector(sel).map(|h| NodeRef::new(self, h))
    }

    fn query_all(&self, sel: &str) -> Vec<NodeRef<'_>> {
        self.query_selector_all(sel)
            .iter()
            .map(|&h| NodeRef::new(self, h))
            .collect()
    }
}

/// Whether `selector` may use `:scope` (then an element-rooted query matches with the
/// element as the scope instead of reusing the document's cached results;
/// miaskiewicz/turbo-dom#96). Over-approximates (`.scope`, escapes) harmlessly.
fn mentions_scope(selector: &str) -> bool {
    selector
        .as_bytes()
        .windows(5)
        .any(|w| w.eq_ignore_ascii_case(b"scope"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rtdom::tree::Tree;

    const HTML: &str =
        "<main><div class=card id=c1><span>hi</span></div><div class=card>x</div></main>";

    #[test]
    fn document_scoped_query() {
        let tree = Tree::parse(HTML);
        let card = tree.query("div.card").expect("first card");
        assert_eq!(card.tag_name().as_deref(), Some("DIV"));
        assert_eq!(card.get_attribute("id"), Some("c1"));
        assert_eq!(card.text_content(), "hi");

        assert_eq!(tree.query_all("div.card").len(), 2);
    }

    #[test]
    fn descendant_scoped_query() {
        let tree = Tree::parse(HTML);
        let cards = tree.query_all("div.card");
        assert_eq!(cards.len(), 2);

        // First card has a <span>, second does not.
        assert_eq!(cards[0].query_selector_all("span").len(), 1);
        assert_eq!(cards[1].query_selector_all("span").len(), 0);

        // The context node itself is excluded from its own query results.
        assert!(cards[0].query_selector("div.card").is_none());
    }

    #[test]
    fn detached_fragment_and_element_queries_preserve_subtree_order() {
        let mut tree = Tree::parse("<main><span id=connected></span></main>");
        let fragment = tree.create_document_fragment();
        let div = tree.create_element("div");
        let first = tree.create_element("span");
        let second = tree.create_element("span");
        tree.append_child(fragment, div);
        tree.append_child(div, first);
        tree.append_child(fragment, second);
        let node = NodeRef::new(&tree, fragment);
        assert_eq!(node.query_selector("span").map(|n| n.handle()), Some(first));
        assert_eq!(
            node.query_selector_all("span")
                .iter()
                .map(NodeRef::handle)
                .collect::<Vec<_>>(),
            vec![first, second]
        );
        let element = NodeRef::new(&tree, div);
        assert!(element.query_selector("div").is_none());
        assert_eq!(
            element.query_selector("span").map(|n| n.handle()),
            Some(first)
        );
        assert_eq!(tree.query_selector_all("span").len(), 1);
    }

    #[test]
    fn navigation() {
        let tree = Tree::parse(HTML);
        let card = tree.query("#c1").expect("card by id");
        let span = card.first_element_child().expect("span child");
        assert_eq!(span.tag_name().as_deref(), Some("SPAN"));
        assert_eq!(span.text_content(), "hi");

        // parent() walks back up.
        let back = span.parent().expect("parent of span");
        assert_eq!(back.get_attribute("id"), Some("c1"));

        // children() of the <main>: two card divs.
        let main = card.parent().expect("main");
        assert_eq!(main.tag_name().as_deref(), Some("MAIN"));
        let kids = main.children();
        assert_eq!(kids.len(), 2);
        assert!(kids.iter().all(|k| k.tag_name().as_deref() == Some("DIV")));

        // element-sibling navigation between the two cards.
        let sib = card.next_element_sibling().expect("second card");
        assert!(sib.matches("div.card"));
        assert_eq!(sib.text_content(), "x");
        assert_eq!(
            sib.previous_element_sibling().map(|n| n.handle()),
            Some(card.handle())
        );
    }

    #[test]
    fn reads_and_handle_tree_accessors() {
        let tree = Tree::parse(HTML);
        let card = tree.query("#c1").expect("card by id");

        // tree() / handle() accessors.
        assert_eq!(card.tree().node_type(card.handle()), NodeType::Element);

        // local_name (lowercase) vs tag_name (uppercase HTML).
        assert_eq!(card.local_name(), Some("div"));
        assert_eq!(card.node_type(), NodeType::Element);

        // has_attribute true/false.
        assert!(card.has_attribute("class"));
        assert!(!card.has_attribute("nope"));

        // attributes() returns the (name, value) pairs.
        let attrs = card.attributes();
        assert!(attrs.iter().any(|(n, v)| n == "id" && v == "c1"));
        assert!(attrs.iter().any(|(n, v)| n == "class" && v == "card"));

        // local_name on a non-element (text node child of span) → None.
        let span = card.first_element_child().expect("span");
        let text = span.first_child().expect("text node");
        assert_eq!(text.local_name(), None);
        assert_ne!(text.node_type(), NodeType::Element);
    }

    #[test]
    fn raw_child_and_sibling_navigation() {
        let tree = Tree::parse(HTML);
        let card = tree.query("#c1").expect("card by id");
        let span = card.first_element_child().expect("span");

        // first_child / last_child on the span (single text node → same handle).
        let first = span.first_child().expect("first child");
        let last = span.last_child().expect("last child");
        assert_eq!(first.handle(), last.handle());
        assert_eq!(first.text_content(), "hi");

        // raw next/previous sibling navigation across the two card divs.
        let next = card.next_sibling().expect("next sibling");
        assert_eq!(next.tag_name().as_deref(), Some("DIV"));
        assert_eq!(
            next.previous_sibling().map(|n| n.handle()),
            Some(card.handle())
        );
    }

    #[test]
    fn navigation_none_paths() {
        // Single leaf element: exercises every None-returning branch.
        let tree = Tree::parse("<main><p>solo</p></main>");
        let p = tree.query("p").expect("p");

        // No element children → first/last_element_child None (covers the loop falling through).
        assert!(p.first_element_child().is_none());
        assert!(p.last_element_child().is_none());

        // Only sibling → no element siblings either direction (covers loop + None).
        assert!(p.next_element_sibling().is_none());
        assert!(p.previous_element_sibling().is_none());

        // Text node leaf: no children, no siblings.
        let txt = p.first_child().expect("text");
        assert!(txt.first_child().is_none());
        assert!(txt.last_child().is_none());
        assert!(txt.next_sibling().is_none());
        assert!(txt.previous_sibling().is_none());

        // Root document has no parent.
        assert!(tree.document().parent().is_none());
    }

    #[test]
    fn element_sibling_skips_non_elements() {
        // Mixed siblings force the element-sibling loops to skip text nodes (continue branch).
        let tree = Tree::parse("<main><span>a</span>text<b>c</b></main>");
        let main = tree.query("main").expect("main");

        let first = main.first_element_child().expect("first element child");
        assert_eq!(first.tag_name().as_deref(), Some("SPAN"));
        let last = main.last_element_child().expect("last element child");
        assert_eq!(last.tag_name().as_deref(), Some("B"));

        // next_element_sibling from <span> must skip the intervening text node to reach <b>.
        let nxt = first.next_element_sibling().expect("b after text");
        assert_eq!(nxt.tag_name().as_deref(), Some("B"));
        // previous_element_sibling from <b> must skip the text node back to <span>.
        let prv = last.previous_element_sibling().expect("span before text");
        assert_eq!(prv.handle(), first.handle());
    }

    #[test]
    fn document_ext_node_and_document() {
        let tree = Tree::parse(HTML);

        // document() wraps the root.
        let doc = tree.document();
        assert_eq!(doc.handle(), tree.root());

        // node() wraps an arbitrary handle.
        let card_h = tree.query("#c1").unwrap().handle();
        let wrapped = tree.node(card_h);
        assert_eq!(wrapped.get_attribute("id"), Some("c1"));

        // query() returning None for an unmatched selector.
        assert!(tree.query(".does-not-exist").is_none());
        assert_eq!(tree.query_all(".does-not-exist").len(), 0);
    }
}
