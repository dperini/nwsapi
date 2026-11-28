use super::{
    match_for_cascade, parse_for_cascade, BulkHasPlanner, CascadeSelector, CompiledSelector,
    Handle, LiveNavigator, NodeType, ScopedNavigator, SelectorConfig, SelectorError,
    SelectorExtensions, SelectorList, TraversalTarget, Tree,
};
use rustc_hash::FxHashMap;
use std::{fmt, rc::Rc};

const STYLESHEET_CACHE_LIMIT: usize = 256;

// The v3 adapter accepts column relationships but they never match. Keep the
// underlying Tree API's physical table-column semantics for its native callers.
pub(super) fn apply_v3_column_rules(selector: &mut super::Complex) {
    use super::{Combinator, Pseudo};
    if selector
        .rest
        .iter()
        .any(|(relation, _)| matches!(relation, Combinator::Column))
    {
        selector.rest.clear();
        selector.first = super::Compound::default();
        selector.first.pseudos.push(Pseudo::Is(Vec::new()));
        return;
    }
    for compound in
        std::iter::once(&mut selector.first).chain(selector.rest.iter_mut().map(|(_, c)| c))
    {
        for pseudo in &mut compound.pseudos {
            match pseudo {
                Pseudo::Is(list)
                | Pseudo::Where(list)
                | Pseudo::Matches(list)
                | Pseudo::Not(list)
                | Pseudo::WebkitAny(list)
                | Pseudo::NthChildOf(_, _, list)
                | Pseudo::NthLastChildOf(_, _, list)
                | Pseudo::Host {
                    selectors: Some(list),
                    ..
                } => list.iter_mut().for_each(apply_v3_column_rules),
                Pseudo::Has(list) => {
                    list.retain(|arm| !matches!(arm.combinator, Combinator::Column));
                    for arm in list {
                        apply_v3_column_rules(&mut arm.complex);
                    }
                }
                Pseudo::HasSlotted(Some(arm), _) => apply_v3_column_rules(arm),
                _ => {}
            }
        }
    }
}

/// Per-call options for the DOM selector adapter.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct QueryOptions {
    /// Return the method's empty value for invalid input or selector syntax.
    pub noexcept: bool,
}

/// A selector error or a context handle unsuitable for the requested query.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdapterError {
    /// The context must be a live element.
    ExpectedElement,
    /// The context must be a live document, document fragment, or element.
    ExpectedQueryRoot,
    /// The selector was invalid.
    Selector(SelectorError),
}

impl fmt::Display for AdapterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ExpectedElement => f.write_str("expected a live Element node"),
            Self::ExpectedQueryRoot => {
                f.write_str("expected a live Document, DocumentFragment, or Element node")
            }
            Self::Selector(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for AdapterError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Selector(error) => Some(error),
            _ => None,
        }
    }
}

/// A stylesheet candidate description. Absent fields match any element.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SelectorSubject {
    pub id: Option<String>,
    pub class_name: Option<String>,
    pub tag: Option<String>,
}

/// A stylesheet check's independently owned selection of matching branches.
#[derive(Clone, Debug)]
pub struct StylesheetMatch {
    syntax: Rc<SelectorList>,
    matched: Vec<usize>,
}

impl StylesheetMatch {
    /// Matching branches in source order, with their specificity.
    pub fn branches(&self) -> impl ExactSizeIterator<Item = &CascadeSelector> {
        self.matched
            .iter()
            .map(|&index| &self.syntax.selectors()[index])
    }

    /// Whether at least one branch matched.
    #[must_use]
    pub fn matched(&self) -> bool {
        !self.matched.is_empty()
    }
}

/// Scoped DOM queries and stylesheet checks for a native document.
pub struct DomSelector<'tree> {
    tree: &'tree mut Tree,
    stylesheets: FxHashMap<String, Rc<SelectorList>>,
}

impl<'tree> DomSelector<'tree> {
    /// Bind an adapter to a native document.
    pub fn new(tree: &'tree mut Tree) -> Self {
        Self {
            tree,
            stylesheets: FxHashMap::default(),
        }
    }

    /// Access the document for DOM reads.
    #[must_use]
    pub fn tree(&self) -> &Tree {
        self.tree
    }

    /// Access the document for DOM mutations.
    pub fn tree_mut(&mut self) -> &mut Tree {
        self.tree
    }

    /// Configure the native engine.
    pub fn configure(&mut self, config: SelectorConfig) {
        self.tree.configure_selectors(config);
    }

    /// Register a native planner for eligible bulk `:has()` queries.
    ///
    /// Pass `None` to restore the built-in planner. Updating the planner
    /// invalidates versioned query results.
    pub fn register_bulk_has_planner(&mut self, planner: Option<BulkHasPlanner>) {
        self.tree.set_bulk_has_planner(planner);
    }

    /// Register a capturing native planner for eligible bulk `:has()` queries.
    ///
    /// The planner owns any state it needs and remains installed on the tree
    /// until replaced or cleared with `register_bulk_has_planner(None)`.
    pub fn register_bulk_has_planner_with(
        &mut self,
        planner: impl Fn(crate::HasFeatures) -> crate::HasRoute + 'static,
    ) {
        self.tree.set_bulk_has_planner_with(planner);
    }

    /// Clear compiled selectors and stylesheet syntax when requested.
    pub fn clear(&mut self, clear_all: bool) {
        if clear_all {
            self.tree.clear_selector_caches();
            self.stylesheets.clear();
        }
    }

    /// Return a conservative wildcard candidate description for stylesheet matching.
    #[must_use]
    pub fn extract_subjects(&self) -> [SelectorSubject; 1] {
        [SelectorSubject::default()]
    }

    /// Whether the engine accepts this DOM selector.
    #[must_use]
    pub fn supports(&self, selector: &str) -> bool {
        self.tree.validate_selector(selector).is_ok()
    }

    /// Whether the engine accepts a selector using the supplied Rust extensions.
    #[must_use]
    pub fn supports_with_extensions(
        &self,
        selector: &str,
        extensions: &SelectorExtensions,
    ) -> bool {
        extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .is_ok()
    }

    /// Test an element against the selector.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid input unless suppressed.
    pub fn matches(
        &self,
        selector: &str,
        element: Handle,
        options: QueryOptions,
    ) -> Result<bool, AdapterError> {
        self.run(selector, element, true, false, options, |plan| {
            plan.matches(self.tree, element)
        })
    }

    /// Test an element and call the callback for each matching selector-list arm.
    pub fn matches_with_callback(
        &self,
        selector: &str,
        element: Handle,
        options: QueryOptions,
        callback: impl FnMut(Handle),
    ) -> Result<bool, AdapterError> {
        self.run(selector, element, true, true, options, |plan| {
            plan.matches_with(self.tree, element, callback)
        })
    }

    /// Find the nearest matching inclusive ancestor.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid input unless suppressed.
    pub fn closest(
        &self,
        selector: &str,
        element: Handle,
        options: QueryOptions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.run(selector, element, true, false, options, |plan| {
            plan.closest(self.tree, element)
        })
    }

    /// Find the nearest inclusive matching ancestor and report its matching arms.
    pub fn closest_with_callback(
        &self,
        selector: &str,
        element: Handle,
        options: QueryOptions,
        callback: impl FnMut(Handle),
    ) -> Result<Option<Handle>, AdapterError> {
        self.run(selector, element, true, true, options, |plan| {
            plan.closest_with(self.tree, element, callback)
        })
    }

    /// Find the first matching descendant of the context.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid input unless suppressed.
    pub fn query_selector(
        &self,
        selector: &str,
        context: Handle,
        options: QueryOptions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.run(selector, context, false, false, options, |plan| {
            if self.tree.is_shadow_root(context) {
                plan.first_in_shadow(self.tree, context)
            } else {
                plan.first(self.tree, Some(context))
            }
        })
    }

    /// Find the first matching descendant and notify the callback once.
    pub fn query_selector_with_callback(
        &self,
        selector: &str,
        context: Handle,
        options: QueryOptions,
        callback: impl FnOnce(Handle),
    ) -> Result<Option<Handle>, AdapterError> {
        self.run(selector, context, false, true, options, |plan| {
            if self.tree.is_shadow_root(context) {
                plan.first_in_shadow(self.tree, context)
                    .inspect(|&node| callback(node))
            } else {
                plan.first_with(self.tree, Some(context), callback)
            }
        })
    }

    /// Find all matching descendants of the context in document order.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid input unless suppressed.
    pub fn query_selector_all(
        &self,
        selector: &str,
        context: Handle,
        options: QueryOptions,
    ) -> Result<Vec<Handle>, AdapterError> {
        self.run(selector, context, false, false, options, |plan| {
            if self.tree.is_shadow_root(context) {
                plan.select_in_shadow(self.tree, context)
            } else {
                plan.select(self.tree, Some(context))
            }
        })
    }

    /// Select descendants in document order, including each visited match in the result.
    ///
    /// Stop after the callback returns `false`; the stopping match is included,
    /// matching NWSAPI's callback contract.
    pub fn query_selector_all_with_callback(
        &self,
        selector: &str,
        context: Handle,
        options: QueryOptions,
        mut callback: impl FnMut(Handle) -> bool,
    ) -> Result<Vec<Handle>, AdapterError> {
        self.run(selector, context, false, true, options, |plan| {
            let selected = if self.tree.is_shadow_root(context) {
                plan.select_in_shadow(self.tree, context)
            } else {
                plan.select(self.tree, Some(context))
            };
            let mut result = Vec::with_capacity(selected.len());
            for node in selected {
                result.push(node);
                if !callback(node) {
                    break;
                }
            }
            result
        })
    }

    /// Test an element with registered native selector extensions.
    pub fn matches_with_extensions(
        &self,
        selector: &str,
        element: Handle,
        extensions: &SelectorExtensions,
    ) -> Result<bool, AdapterError> {
        self.validate_context(element, true)?;
        Ok(extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?
            .matches(self.tree, element))
    }

    /// Find the nearest inclusive matching ancestor using registered extensions.
    pub fn closest_with_extensions(
        &self,
        selector: &str,
        element: Handle,
        extensions: &SelectorExtensions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        Ok(extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?
            .closest(self.tree, element))
    }

    /// Find the first descendant using registered native selector extensions.
    pub fn query_selector_with_extensions(
        &self,
        selector: &str,
        context: Handle,
        extensions: &SelectorExtensions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(context, false)?;
        let plan = extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?;
        Ok(if self.tree.is_shadow_root(context) {
            plan.first_in_shadow(self.tree, context)
        } else {
            plan.first(self.tree, Some(context))
        })
    }

    /// Find all descendants using registered native selector extensions.
    pub fn query_selector_all_with_extensions(
        &self,
        selector: &str,
        context: Handle,
        extensions: &SelectorExtensions,
    ) -> Result<Vec<Handle>, AdapterError> {
        self.validate_context(context, false)?;
        let plan = extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?;
        Ok(if self.tree.is_shadow_root(context) {
            plan.select_in_shadow(self.tree, context)
        } else {
            plan.select(self.tree, Some(context))
        })
    }

    /// Find descendant elements containing every CSS-whitespace-delimited class token.
    ///
    /// `context` may be an element, document, or document fragment. `None` uses the
    /// document root. As with `query_selector_all`, the context itself is excluded.
    pub fn by_class(
        &self,
        classes: &str,
        context: Option<Handle>,
    ) -> Result<Vec<Handle>, AdapterError> {
        let root = context.unwrap_or_else(|| self.tree.root());
        self.validate_context(root, false)?;
        Ok(self.tree.by_class(Some(root), classes))
    }

    /// Find descendant elements with the exact ID, in tree order.
    ///
    /// Duplicate results follow the configured `ids_dupes` option. `None` uses
    /// the document root, and the context itself is excluded.
    pub fn by_id(&self, id: &str, context: Option<Handle>) -> Result<Vec<Handle>, AdapterError> {
        let root = context.unwrap_or_else(|| self.tree.root());
        self.validate_context(root, false)?;
        Ok(self.tree.by_id(Some(root), id))
    }

    /// Find descendant elements by local tag name, or all elements for `*`.
    ///
    /// HTML names compare ASCII case-insensitively; XML names compare exactly.
    /// `None` uses the document root, and the context itself is excluded.
    pub fn by_tag(&self, tag: &str, context: Option<Handle>) -> Result<Vec<Handle>, AdapterError> {
        let root = context.unwrap_or_else(|| self.tree.root());
        self.validate_context(root, false)?;
        Ok(self.tree.by_tag(Some(root), tag))
    }

    /// Find an ancestor by selector or zero-based index (default index: `0`).
    pub fn up(
        &self,
        element: Handle,
        target: TraversalTarget<'_>,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        Ok(self.tree.up(element, target))
    }

    /// Find an ancestor matching a selector compiled with Rust extensions.
    pub fn up_with_extensions(
        &self,
        element: Handle,
        selector: &str,
        extensions: &SelectorExtensions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        let plan = extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?;
        Ok(self.tree.up(element, TraversalTarget::Selector(&plan)))
    }

    /// Find a descendant by selector or zero-based document-order index.
    ///
    /// `None` returns the first element child. An index target of `0` or a
    /// selector target matching `element` returns `element` itself.
    pub fn down(
        &self,
        element: Handle,
        target: Option<TraversalTarget<'_>>,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        Ok(self.tree.down(element, target))
    }

    /// Find a descendant matching a selector compiled with Rust extensions.
    pub fn down_with_extensions(
        &self,
        element: Handle,
        selector: &str,
        extensions: &SelectorExtensions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        let plan = extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?;
        Ok(self
            .tree
            .down(element, Some(TraversalTarget::Selector(&plan))))
    }

    /// Find a following sibling by selector or zero-based index (default index: `0`).
    pub fn next(
        &self,
        element: Handle,
        target: TraversalTarget<'_>,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        Ok(self.tree.next(element, target))
    }

    /// Find a following sibling matching a selector compiled with Rust extensions.
    pub fn next_with_extensions(
        &self,
        element: Handle,
        selector: &str,
        extensions: &SelectorExtensions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        let plan = extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?;
        Ok(self.tree.next(element, TraversalTarget::Selector(&plan)))
    }

    /// Find a preceding sibling by selector or zero-based index (default index: `0`).
    pub fn previous(
        &self,
        element: Handle,
        target: TraversalTarget<'_>,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        Ok(self.tree.previous(element, target))
    }

    /// Find a preceding sibling matching a selector compiled with Rust extensions.
    pub fn previous_with_extensions(
        &self,
        element: Handle,
        selector: &str,
        extensions: &SelectorExtensions,
    ) -> Result<Option<Handle>, AdapterError> {
        self.validate_context(element, true)?;
        let plan = extensions
            .compile_for_adapter(selector, self.tree.selector_config().forgiving)
            .map_err(AdapterError::Selector)?;
        Ok(self
            .tree
            .previous(element, TraversalTarget::Selector(&plan)))
    }

    /// Parse a stylesheet selector list and reuse its syntax across checks.
    ///
    /// # Errors
    ///
    /// Returns a selector error for an invalid stylesheet selector list.
    pub fn parse(&mut self, selector: &str) -> Result<Rc<SelectorList>, SelectorError> {
        if let Some(parsed) = self.stylesheets.get(selector) {
            return Ok(parsed.clone());
        }
        let parsed = Rc::new(parse_for_cascade(selector)?);
        if self.stylesheets.len() >= STYLESHEET_CACHE_LIMIT {
            self.stylesheets.clear();
        }
        self.stylesheets.insert(selector.to_owned(), parsed.clone());
        Ok(parsed)
    }

    /// Parse stylesheet selectors with registered Rust selector extensions.
    ///
    /// The result is not retained in the ordinary stylesheet cache because its
    /// predicates and combinators depend on the supplied extension registry.
    pub fn parse_with_extensions(
        &self,
        selector: &str,
        extensions: &SelectorExtensions,
    ) -> Result<Rc<SelectorList>, SelectorError> {
        // Stylesheet selectors keep pseudo-elements as stylesheet targets, while
        // registered pseudo-classes still bind to their Rust predicates.
        super::parse_for_cascade_with_extensions(selector, extensions).map(Rc::new)
    }

    /// Check a stylesheet selector list against one element.
    ///
    /// Invalid context or syntax produces no result. Valid checks return the
    /// matching branches and omit pseudo-elements.
    pub fn check(&mut self, selector: &str, element: Handle) -> Option<StylesheetMatch> {
        self.validate_context(element, true).ok()?;
        let syntax = self.parse(selector).ok()?;
        if !self.tree.selector_config().forgiving {
            for branch in syntax.selectors() {
                if branch.pseudo_element().is_none() {
                    self.tree.validate_selector(branch.text()).ok()?;
                }
            }
        }
        Some(self.check_parsed(element, syntax))
    }

    /// Check stylesheet branches compiled with registered Rust selector extensions.
    ///
    /// Extension-aware syntax is parsed for this call and is not retained in the
    /// ordinary stylesheet cache, whose entries do not include extension state.
    pub fn check_with_extensions(
        &mut self,
        selector: &str,
        element: Handle,
        extensions: &SelectorExtensions,
    ) -> Option<StylesheetMatch> {
        self.validate_context(element, true).ok()?;
        let syntax = self.parse_with_extensions(selector, extensions).ok()?;
        if !self.tree.selector_config().forgiving {
            for branch in syntax.selectors() {
                if branch.pseudo_element().is_none() {
                    extensions
                        .compile_with_forgiving(branch.text(), false)
                        .ok()?;
                }
            }
        }
        Some(self.check_parsed(element, syntax))
    }

    fn check_parsed(&self, element: Handle, syntax: Rc<SelectorList>) -> StylesheetMatch {
        let shadow_scope = self.tree.is_shadow_root(element).then_some(element);
        let nav = ScopedNavigator {
            live: LiveNavigator(self.tree),
            scope: element,
            shadow_scope,
        };
        let matched = syntax
            .selectors()
            .iter()
            .enumerate()
            .filter_map(|(index, branch)| {
                (branch.pseudo_element().is_none() && match_for_cascade(&nav, element, branch))
                    .then_some(index)
            })
            .collect();
        StylesheetMatch { syntax, matched }
    }

    fn validate_context(&self, context: Handle, element_only: bool) -> Result<(), AdapterError> {
        let kind = self
            .tree
            .is_live(context)
            .then(|| self.tree.node_type(context));
        match kind {
            Some(NodeType::Element) => Ok(()),
            Some(NodeType::Document | NodeType::Fragment) if !element_only => Ok(()),
            _ if element_only => Err(AdapterError::ExpectedElement),
            _ => Err(AdapterError::ExpectedQueryRoot),
        }
    }

    fn compile_resolver_list(
        &self,
        selector: &str,
        matching: bool,
        callback: bool,
    ) -> Result<Option<CompiledSelector>, AdapterError> {
        if let Err(error) = self.tree.validate_selector(selector) {
            self.tree.emit(error).map_err(AdapterError::Selector)?;
            return Ok(None);
        }
        let normalized = super::source::normalize_str(selector, super::source::Mode::Dom);
        // Selection invokes callbacks on the merged results, outside the compiled arm.
        let (lambdas, prefix) = if matching {
            (
                &self.tree.match_lambdas,
                if callback {
                    "selector:false:true:"
                } else {
                    "selector:false:false:"
                },
            )
        } else {
            (&self.tree.select_lambdas, "selector:true:false:")
        };
        let mut plans = Vec::new();
        for arm in super::split_top_level_commas(&normalized) {
            let arm = arm.trim_start_matches([' ', '\t', '\n', '\r', '\x0c']);
            let trimmed = arm.trim_end_matches([' ', '\t', '\n', '\r', '\x0c']);
            let arm = if trimmed.ends_with('\\') {
                arm
            } else {
                trimmed
            };
            let key = format!("{prefix}{arm}");
            let cached = lambdas.borrow_mut().get(&key);
            let plan = cached.unwrap_or_else(|| {
                let mut plan = self.tree.parse_selector_cached(arm);
                if arm.contains("||") {
                    let mut selectors = plan.selectors.to_vec();
                    selectors.iter_mut().for_each(apply_v3_column_rules);
                    plan = Rc::new(super::PreparedList::new(selectors, arm.len()));
                }
                lambdas.borrow_mut().retain_plan(
                    self.tree.selector_config(),
                    key.len(),
                    || key,
                    &plan,
                );
                plan
            });
            plans.push(plan);
        }
        let plan = if plans.len() == 1 {
            plans.pop().unwrap()
        } else {
            Rc::new(super::PreparedList::join(&plans))
        };
        Ok(Some(CompiledSelector(plan)))
    }

    fn run<T: Default>(
        &self,
        selector: &str,
        context: Handle,
        element_only: bool,
        callback: bool,
        options: QueryOptions,
        query: impl FnOnce(CompiledSelector) -> T,
    ) -> Result<T, AdapterError> {
        let result = self.validate_context(context, element_only).and_then(|()| {
            let cache = if element_only {
                &self.tree.match_resolvers
            } else {
                &self.tree.select_resolvers
            };
            let match_key;
            let key = if element_only {
                match_key = format!("{callback}:{selector}");
                match_key.as_str()
            } else {
                selector
            };
            let cached = cache.borrow_mut().get(key);
            if let Some(plan) = cached {
                return Ok(query(CompiledSelector(plan)));
            }
            let compiled = self.compile_resolver_list(selector, element_only, callback)?;
            let Some(plan) = compiled else {
                return Ok(T::default());
            };
            cache.borrow_mut().retain_plan(
                self.tree.selector_config(),
                key.len(),
                || key.to_owned(),
                &plan.0,
            );
            Ok(query(plan))
        });
        if options.noexcept {
            return Ok(result.unwrap_or_default());
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_uses_independent_public_resolver_caches() {
        let mut tree = Tree::parse("<p></p><b></b>");
        let root = tree.root();
        let mut adapter = DomSelector::new(&mut tree);
        let options = QueryOptions::default();
        let p = adapter.query_selector("p", root, options).unwrap().unwrap();
        let b = adapter.tree().compile_selector("b").unwrap();
        assert!(adapter.tree_mut().select_resolvers().has("p"));
        assert!(!adapter.tree_mut().match_resolvers().has("false:p"));
        adapter.tree_mut().match_resolvers().set("false:p", b);
        assert!(!adapter.matches("p", p, options).unwrap());
        let mut visited = Vec::new();
        assert!(adapter
            .matches_with_callback("p", p, options, |node| visited.push(node))
            .unwrap());
        assert_eq!(visited, [p]);
        assert!(adapter.tree_mut().match_resolvers().has("true:p"));
        assert_eq!(adapter.query_selector("p", root, options).unwrap(), Some(p));
        adapter.tree_mut().match_resolvers().clear();
        assert!(adapter.matches("p", p, options).unwrap());
        assert!(adapter.matches(":is(p, b)", p, options).unwrap());
        assert!(adapter
            .tree_mut()
            .match_lambdas()
            .has("selector:false:false::is(p, b)"));
        let replacement = adapter.tree().compile_selector("b").unwrap();
        adapter
            .tree_mut()
            .match_lambdas()
            .set("selector:false:false:p", replacement);
        assert!(adapter.matches("p", p, options).unwrap());
        adapter.tree_mut().match_resolvers().clear();
        assert!(!adapter.matches("p", p, options).unwrap());
        assert!(adapter
            .matches_with_callback("p", p, options, |_| {})
            .unwrap());
        adapter.clear(true);
        assert_eq!(adapter.tree_mut().select_resolvers().bytes(), 0);
        assert_eq!(adapter.tree_mut().match_resolvers().size(), 0);
    }

    #[test]
    fn match_list_uses_each_cached_arm_and_preserves_callback_order() {
        let mut tree = Tree::parse("<p></p>");
        let p = tree.query_selector("p").unwrap();
        let plan = tree.compile_selector("p").unwrap();
        tree.match_lambdas()
            .set("selector:false:true:.replacement", plan);
        let adapter = DomSelector::new(&mut tree);
        let mut visited = Vec::new();
        assert!(adapter
            .matches_with_callback(
                ".replacement, :is(p, b), aside",
                p,
                QueryOptions::default(),
                |node| visited.push(node),
            )
            .unwrap());
        assert_eq!(visited, [p, p]);
    }

    #[test]
    fn selection_arms_share_plans_across_lists_and_preserve_document_order() {
        let mut tree = Tree::parse("<main><b></b><p></p></main>");
        let root = tree.root();
        let p = tree.query_selector("p").unwrap();
        let b = tree.query_selector("b").unwrap();
        let replacement = tree.compile_selector("p").unwrap();
        tree.select_lambdas()
            .set("selector:true:false:.replacement", replacement);
        let mut adapter = DomSelector::new(&mut tree);
        let options = QueryOptions::default();
        let list = ".replacement, b, p";
        assert_eq!(
            adapter.query_selector_all(list, root, options).unwrap(),
            [b, p]
        );
        adapter.tree_mut().select_resolvers().clear();
        let mut visited = Vec::new();
        adapter
            .query_selector_all_with_callback(list, root, options, |node| {
                visited.push(node);
                true
            })
            .unwrap();
        assert_eq!(visited, [b, p]);
        adapter.clear(true);
        assert_eq!(adapter.tree_mut().select_lambdas().size(), 0);
        assert_eq!(
            adapter
                .query_selector(".replacement", root, options)
                .unwrap(),
            None
        );
    }

    fn featured(tree: &Tree, node: Handle, _: Option<&str>) -> bool {
        tree.has_attribute(node, "data-featured")
    }

    fn parent_relation(tree: &Tree, node: Handle, visit: &mut dyn FnMut(Handle) -> bool) -> bool {
        tree.parent(node)
            .filter(|&parent| tree.node_type(parent) == NodeType::Element)
            .is_some_and(visit)
    }

    #[test]
    fn adapter_registers_and_clears_bulk_has_planners() {
        fn forward(features: crate::HasFeatures) -> crate::HasRoute {
            assert_eq!(features.relationship, crate::HasRelationship::Child);
            assert_eq!(features.anchors, 2);
            assert_eq!(features.witnesses, 1);
            crate::HasRoute::Forward
        }
        let mut tree = Tree::parse(
            "<main><div class=anchor><span class=witness></span></div>\
             <section><div class=anchor></div></section></main>",
        );
        let main = tree.query_selector("main").unwrap();
        let mut adapter = DomSelector::new(&mut tree);
        assert!(!adapter.tree().has_custom_bulk_has_planner());
        adapter.register_bulk_has_planner(Some(forward));
        assert!(adapter.tree().has_custom_bulk_has_planner());
        assert_eq!(
            adapter
                .query_selector_all(".anchor:has(> .witness)", main, QueryOptions::default(),)
                .unwrap()
                .len(),
            1
        );
        adapter.register_bulk_has_planner(None);
        assert!(!adapter.tree().has_custom_bulk_has_planner());
        assert_eq!(
            adapter
                .query_selector_all(".anchor:has(> .witness)", main, QueryOptions::default(),)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn adapter_accepts_capturing_bulk_has_planner() {
        let expected_relationship = crate::HasRelationship::Child;
        let owned_state = String::from("forward");
        let mut tree = Tree::parse(
            "<main><div class=anchor><span class=witness></span></div>\
             <section><div class=anchor></div></section></main>",
        );
        let main = tree.query_selector("main").unwrap();
        let mut adapter = DomSelector::new(&mut tree);
        adapter.register_bulk_has_planner_with(move |features| {
            assert_eq!(features.relationship, expected_relationship);
            assert_eq!(features.anchors, 2);
            assert_eq!(features.witnesses, 1);
            if owned_state == "forward" {
                crate::HasRoute::Forward
            } else {
                crate::HasRoute::Inverse
            }
        });
        assert_eq!(
            adapter
                .query_selector_all(".anchor:has(> .witness)", main, QueryOptions::default())
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn callback_queries_follow_nwsapi_notification_and_stop_rules() {
        let mut tree = Tree::parse(
            "<main><p id=a class=pick><span id=child></span></p><p id=b class=pick></p></main>",
        );
        let root = tree.root();
        let main = tree.query_selector("main").unwrap();
        let a = tree.get_element_by_id("a").unwrap();
        let b = tree.get_element_by_id("b").unwrap();
        let child = tree.get_element_by_id("child").unwrap();
        let adapter = DomSelector::new(&mut tree);

        let mut selected = Vec::new();
        let result = adapter
            .query_selector_all_with_callback("p.pick, #a", main, QueryOptions::default(), |node| {
                selected.push(node);
                false
            })
            .unwrap();
        assert_eq!(result, [a]);
        assert_eq!(selected, [a]);

        let mut first = None;
        assert_eq!(
            adapter
                .query_selector_with_callback("p.pick", main, QueryOptions::default(), |node| {
                    first = Some(node);
                },)
                .unwrap(),
            Some(a)
        );
        assert_eq!(first, Some(a));

        let mut matched_arms = Vec::new();
        assert!(adapter
            .matches_with_callback("p.pick, #a", a, QueryOptions::default(), |node| {
                matched_arms.push(node);
            },)
            .unwrap());
        assert_eq!(matched_arms, [a, a]);

        let mut closest_arms = Vec::new();
        assert_eq!(
            adapter
                .closest_with_callback("p.pick, #a", child, QueryOptions::default(), |node| {
                    closest_arms.push(node);
                },)
                .unwrap(),
            Some(a)
        );
        assert_eq!(closest_arms, [a, a]);

        assert_eq!(
            adapter
                .query_selector_all("p.pick", root, QueryOptions::default())
                .unwrap(),
            [a, b]
        );
    }

    #[test]
    fn adapter_checks_context_and_runs_live_document_element_and_fragment_queries() {
        let mut tree = Tree::parse("<main><p id=inside>text</p></main><p id=outside></p>");
        let root = tree.root();
        let main = tree.query_selector("main").unwrap();
        let inside = tree.get_element_by_id("inside").unwrap();
        let outside = tree.get_element_by_id("outside").unwrap();
        let text = tree.first_child(inside).unwrap();
        let fragment = tree.create_document_fragment();
        let detached = tree.create_element("p");
        tree.append_child(fragment, detached);

        let strict = QueryOptions::default();
        let quiet = QueryOptions { noexcept: true };
        let mut adapter = DomSelector::new(&mut tree);
        assert_eq!(
            adapter.query_selector_all("p", root, strict).unwrap(),
            [inside, outside]
        );
        assert_eq!(
            adapter.query_selector(":scope > p", main, strict).unwrap(),
            Some(inside)
        );
        assert_eq!(
            adapter.query_selector("p", fragment, strict).unwrap(),
            Some(detached)
        );
        assert_eq!(adapter.closest("main", inside, strict).unwrap(), Some(main));
        assert!(adapter.matches(":scope", inside, strict).unwrap());
        assert_eq!(
            adapter.matches("p", root, strict),
            Err(AdapterError::ExpectedElement)
        );
        assert_eq!(
            adapter.query_selector("p", text, strict),
            Err(AdapterError::ExpectedQueryRoot)
        );
        assert!(adapter.query_selector("p >> i", root, strict).is_err());
        assert!(!adapter.matches("p", text, quiet).unwrap());
        assert_eq!(
            adapter.query_selector_all("p >> i", root, quiet).unwrap(),
            []
        );

        adapter.tree_mut().append_child(main, outside);
        assert_eq!(
            adapter.query_selector_all("p", main, strict).unwrap(),
            [inside, outside]
        );
        assert!(adapter.supports("main > :is(p, :unsupported)"));
        let config = SelectorConfig {
            forgiving: false,
            ..adapter.tree().selector_config()
        };
        adapter.configure(config);
        assert!(!adapter.supports("main > :is(p, :unsupported)"));
        assert_eq!(adapter.extract_subjects(), [SelectorSubject::default()]);
    }

    #[test]
    fn direct_lookups_match_documented_descendant_and_duplicate_id_behavior() {
        let mut tree = Tree::parse(
            "<main id=scope><p id=dup class='one two'></p><p id=dup class=one></p></main><p id=dup></p>",
        );
        let root = tree.root();
        let main = tree.query_selector("main").unwrap();
        let expected = tree.query_selector_all("main > p").to_vec();
        let text = tree.create_text_node("context");
        let mut adapter = DomSelector::new(&mut tree);

        assert_eq!(
            adapter.by_class("one two", Some(main)).unwrap(),
            [expected[0]]
        );
        assert_eq!(adapter.by_tag("P", Some(main)).unwrap(), expected);
        assert_eq!(adapter.by_id("dup", Some(main)).unwrap(), expected);
        assert_eq!(adapter.by_tag("*", Some(main)).unwrap(), expected);
        assert_eq!(adapter.by_id("scope", Some(main)).unwrap(), []);
        assert_eq!(adapter.by_id("dup", Some(root)).unwrap().len(), 3);

        let config = SelectorConfig {
            ids_dupes: false,
            ..adapter.tree().selector_config()
        };
        adapter.configure(config);
        assert_eq!(adapter.by_id("dup", Some(main)).unwrap(), [expected[0]]);
        assert_eq!(adapter.by_id("missing", Some(main)).unwrap(), []);
        assert_eq!(
            adapter.by_tag("p", Some(text)).unwrap_err(),
            AdapterError::ExpectedQueryRoot
        );
    }

    #[test]
    fn traversal_methods_match_the_optional_plugin_index_and_selector_rules() {
        let mut tree = Tree::parse(
            "<main><section id=one><i id=first></i><b id=second></b></section><section id=two></section></main>",
        );
        let one = tree.get_element_by_id("one").unwrap();
        let two = tree.get_element_by_id("two").unwrap();
        let first = tree.get_element_by_id("first").unwrap();
        let second = tree.get_element_by_id("second").unwrap();
        let main = tree.query_selector("main").unwrap();
        let plan = tree.compile_selector("section, i, b").unwrap();
        let adapter = DomSelector::new(&mut tree);

        assert_eq!(adapter.down(one, None).unwrap(), Some(first));
        assert_eq!(
            adapter.down(one, Some(TraversalTarget::Index(0))).unwrap(),
            Some(one)
        );
        assert_eq!(
            adapter.down(one, Some(TraversalTarget::Index(2))).unwrap(),
            Some(second)
        );
        assert_eq!(
            adapter
                .down(one, Some(TraversalTarget::Selector(&plan)))
                .unwrap(),
            Some(one)
        );
        assert_eq!(
            adapter.next(one, TraversalTarget::Index(0)).unwrap(),
            Some(two)
        );
        assert_eq!(
            adapter
                .previous(two, TraversalTarget::Selector(&plan))
                .unwrap(),
            Some(one)
        );
        assert_eq!(
            adapter.up(one, TraversalTarget::Index(0)).unwrap(),
            Some(main)
        );
    }

    #[test]
    fn stylesheet_checks_own_their_matches_and_reuse_syntax() {
        let mut tree = Tree::parse("<p id=a class=tag></p><p id=b></p>");
        let a = tree.get_element_by_id("a").unwrap();
        let b = tree.get_element_by_id("b").unwrap();
        let mut adapter = DomSelector::new(&mut tree);
        let source = "p::before, .tag, p, #a, :scope";
        let parsed = adapter.parse(source).unwrap();
        let first = adapter.check(source, a).unwrap();
        let second = adapter.check(source, b).unwrap();
        let summaries = |result: &StylesheetMatch| {
            result
                .branches()
                .map(|branch| (branch.text().to_owned(), branch.specificity()))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            summaries(&first),
            [
                (".tag".into(), (0, 1, 0)),
                ("p".into(), (0, 0, 1)),
                ("#a".into(), (1, 0, 0)),
                (":scope".into(), (0, 1, 0)),
            ]
        );
        assert_eq!(
            summaries(&second),
            [("p".into(), (0, 0, 1)), (":scope".into(), (0, 1, 0))]
        );
        assert!(!adapter.check("p::before", a).unwrap().matched());
        assert!(adapter.check("p, >", a).is_none());
        assert!(adapter.check("p", adapter.tree().root()).is_none());

        adapter.tree_mut().set_attribute(b, "class", "tag");
        assert_eq!(adapter.check(source, b).unwrap().branches().len(), 3);
        assert_eq!(second.branches().len(), 2);
        adapter.clear(false);
        assert!(Rc::ptr_eq(&parsed, &adapter.parse(source).unwrap()));
        adapter.clear(true);
        assert!(!Rc::ptr_eq(&parsed, &adapter.parse(source).unwrap()));
        assert_eq!(first.branches().len(), 4);
    }

    #[test]
    fn strict_stylesheet_checks_skip_pseudo_element_branches() {
        let mut tree = Tree::parse("<main><p id=target class=match></p></main>");
        let target = tree.get_element_by_id("target").unwrap();
        let mut adapter = DomSelector::new(&mut tree);
        adapter.configure(SelectorConfig {
            forgiving: false,
            ..SelectorConfig::default()
        });

        let result = adapter.check("p::before, .match", target).unwrap();
        assert_eq!(
            result
                .branches()
                .map(CascadeSelector::text)
                .collect::<Vec<_>>(),
            [".match"]
        );
        assert!(adapter.check(".match, >", target).is_none());
        assert!(adapter
            .check(":is(.match, :unknown), .match", target)
            .is_none());
    }

    #[test]
    fn adapter_queries_use_registered_selector_extensions() {
        let mut tree =
            Tree::parse("<main><p id=featured data-featured></p><p id=plain></p></main>");
        let main = tree.query_selector("main").unwrap();
        let featured_node = tree.get_element_by_id("featured").unwrap();
        let plain = tree.get_element_by_id("plain").unwrap();
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_selector(
            "featured",
            super::super::SelectorArity::Flag,
            featured
        ));
        let mut adapter = DomSelector::new(&mut tree);

        assert_eq!(
            adapter
                .query_selector_all_with_extensions("main > p:featured", main, &extensions)
                .unwrap(),
            [featured_node]
        );
        assert_eq!(
            adapter
                .query_selector_with_extensions("p:featured", main, &extensions)
                .unwrap(),
            Some(featured_node)
        );
        assert_eq!(
            adapter
                .query_selector_all_with_extensions(
                    "main:has(> p:featured)",
                    adapter.tree().root(),
                    &extensions,
                )
                .unwrap(),
            [main]
        );
        assert!(adapter
            .matches_with_extensions(":featured", featured_node, &extensions)
            .unwrap());
        assert_eq!(
            adapter
                .closest_with_extensions(":featured", featured_node, &extensions)
                .unwrap(),
            Some(featured_node)
        );
        assert!(!adapter
            .matches_with_extensions(":featured", plain, &extensions)
            .unwrap());
        assert!(adapter
            .query_selector_all_with_extensions(":is(:featured, :unknown)", main, &extensions)
            .is_ok());
        let strict = SelectorConfig {
            forgiving: false,
            ..adapter.tree().selector_config()
        };
        adapter.configure(strict);
        assert!(adapter
            .query_selector_all_with_extensions(":is(:featured, :unknown)", main, &extensions)
            .is_err());
    }

    #[test]
    fn traversal_and_support_checks_use_registered_selector_extensions() {
        let mut tree = Tree::parse(
            "<main><section id=up data-featured><p id=previous data-featured></p>\
            <div id=anchor><span id=down data-featured></span></div>\
            <p id=next data-featured></p></section></main>",
        );
        let anchor = tree.get_element_by_id("anchor").unwrap();
        let expected =
            ["up", "down", "next", "previous"].map(|id| tree.get_element_by_id(id).unwrap());
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_selector(
            "featured",
            super::super::SelectorArity::Flag,
            featured
        ));
        let adapter = DomSelector::new(&mut tree);

        assert!(!adapter.supports(":featured"));
        assert!(adapter.supports_with_extensions(":featured", &extensions));
        assert_eq!(
            adapter
                .up_with_extensions(anchor, ":featured", &extensions)
                .unwrap(),
            Some(expected[0])
        );
        assert_eq!(
            adapter
                .down_with_extensions(anchor, ":featured", &extensions)
                .unwrap(),
            Some(expected[1])
        );
        assert_eq!(
            adapter
                .next_with_extensions(anchor, ":featured", &extensions)
                .unwrap(),
            Some(expected[2])
        );
        assert_eq!(
            adapter
                .previous_with_extensions(anchor, ":featured", &extensions)
                .unwrap(),
            Some(expected[3])
        );
        assert!(adapter
            .up_with_extensions(anchor, ":unknown", &extensions)
            .is_err());
    }

    #[test]
    fn stylesheet_checks_bind_extensions_without_caching_extension_state() {
        let mut tree =
            Tree::parse("<main><p id=featured data-featured></p><p id=plain></p></main>");
        let main = tree.query_selector("main").unwrap();
        let featured_node = tree.get_element_by_id("featured").unwrap();
        let plain = tree.get_element_by_id("plain").unwrap();
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_selector(
            "featured",
            super::super::SelectorArity::Flag,
            featured
        ));
        let mut adapter = DomSelector::new(&mut tree);

        assert!(adapter.parse(":featured").is_err());
        assert!(adapter
            .parse_with_extensions("p::featured", &extensions)
            .is_err());
        let extended_parse = adapter
            .parse_with_extensions(":featured", &extensions)
            .unwrap();
        assert_eq!(extended_parse.selectors()[0].specificity(), (0, 1, 0));
        let forgiving = adapter
            .parse_with_extensions(":is(:featured, :unknown)", &extensions)
            .unwrap();
        assert_eq!(forgiving.selectors()[0].specificity(), (0, 1, 0));
        assert!(adapter
            .parse_with_extensions(":not(:featured, :unknown)", &extensions)
            .is_err());
        let result = adapter
            .check_with_extensions(":featured, p", featured_node, &extensions)
            .unwrap();
        assert_eq!(
            result
                .branches()
                .map(|branch| (branch.text(), branch.specificity()))
                .collect::<Vec<_>>(),
            [(":featured", (0, 1, 0)), ("p", (0, 0, 1))]
        );
        let pseudo_element = adapter
            .check_with_extensions(":featured::before, :featured", featured_node, &extensions)
            .unwrap();
        assert_eq!(
            pseudo_element
                .branches()
                .map(CascadeSelector::text)
                .collect::<Vec<_>>(),
            [":featured"]
        );
        let registered_pseudo_element = adapter
            .check_with_extensions("p::before, p", featured_node, &extensions)
            .unwrap();
        assert_eq!(
            registered_pseudo_element
                .branches()
                .map(CascadeSelector::text)
                .collect::<Vec<_>>(),
            ["p"]
        );
        assert!(!adapter
            .check_with_extensions(":featured", plain, &extensions)
            .unwrap()
            .matched());
        assert!(adapter
            .check_with_extensions("main:has(:featured)", main, &extensions)
            .unwrap()
            .matched());
        assert!(adapter
            .check_with_extensions(":unknown", plain, &extensions)
            .is_none());

        assert!(extensions.register_combinator('!', parent_relation));
        assert!(adapter.parse_with_extensions("main!p", &extensions).is_ok());
        assert!(adapter
            .check_with_extensions("main!p", featured_node, &extensions)
            .unwrap()
            .matched());

        adapter.configure(SelectorConfig {
            forgiving: false,
            ..SelectorConfig::default()
        });
        assert_eq!(
            adapter
                .check_with_extensions(":featured::before, :featured", featured_node, &extensions)
                .unwrap()
                .branches()
                .map(CascadeSelector::text)
                .collect::<Vec<_>>(),
            [":featured"]
        );
        assert!(adapter
            .check_with_extensions(
                ":is(:featured, :unknown), .match",
                featured_node,
                &extensions
            )
            .is_none());
    }

    #[test]
    fn shadow_root_queries_apply_chained_jquery_positions() {
        let mut tree = Tree::parse("<main><div id=host></div></main>");
        let host = tree.get_element_by_id("host").unwrap();
        let shadow = tree.attach_shadow(host);
        let nodes = ["p", "p", "p"].map(|tag| tree.create_element(tag));
        for node in nodes {
            tree.append_child(shadow, node);
        }
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_jquery());
        let adapter = DomSelector::new(&mut tree);

        assert_eq!(
            adapter
                .query_selector_all_with_extensions("p:even:odd", shadow, &extensions)
                .unwrap(),
            nodes
        );
        assert_eq!(
            adapter
                .query_selector_with_extensions("p:eq(1):lt(3)", shadow, &extensions)
                .unwrap(),
            Some(nodes[1])
        );
    }

    #[test]
    fn shadow_dom_queries_and_stylesheet_checks_share_host_scope() {
        let mut tree =
            Tree::parse("<!doctype html><body class=outer><div id=host class=host></div></body>");
        let host = tree.get_element_by_id("host").unwrap();
        let shadow = tree.attach_shadow(host);
        let slot = tree.create_element("slot");
        tree.append_child(shadow, slot);
        let mut adapter = DomSelector::new(&mut tree);
        assert_eq!(
            adapter
                .query_selector(
                    ":host-context(.outer) > slot",
                    shadow,
                    QueryOptions::default()
                )
                .unwrap(),
            Some(slot)
        );
        assert!(adapter
            .check(":host(.host) > slot", slot)
            .unwrap()
            .matched());
        assert!(adapter
            .check(":host-context(body) > slot", slot)
            .unwrap()
            .matched());
        assert!(!adapter
            .check(":host(.missing) > slot", slot)
            .unwrap()
            .matched());
    }
}
