use super::{
    matches_complex, Complex, Handle, LiveNavigator, Navigator, NodeType, ScopedNavigator, Tree,
};
use std::rc::Rc;

#[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
#[path = "prepared/native.rs"]
mod native;

pub(crate) struct PreparedList {
    pub(super) source_bytes: usize,
    pub(super) selectors: Rc<[Complex]>,
    positions: Option<Box<[Box<[PositionStep]>]>>,
    #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
    native: std::cell::RefCell<NativeState>,
}

#[derive(Clone)]
struct PositionStep {
    position: super::jquery::Position,
    prefix: Complex,
}

#[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
enum NativeState {
    Unsupported,
    Cold,
    Seen,
    Requested(std::rc::Weak<native::Slot>),
}

impl PreparedList {
    pub(super) fn join(arms: &[Rc<Self>]) -> Self {
        let mut selectors = Vec::new();
        let mut positions = arms
            .iter()
            .any(|arm| arm.positions.is_some())
            .then(Vec::new);
        for arm in arms {
            selectors.extend(arm.selectors.iter().cloned());
            if let Some(positions) = &mut positions {
                if let Some(steps) = &arm.positions {
                    positions.extend(steps.iter().cloned());
                } else {
                    positions.resize_with(selectors.len(), Box::default);
                }
            }
        }
        Self::with_positions(
            selectors,
            positions.map(Vec::into_boxed_slice),
            arms.iter()
                .fold(0usize, |bytes, arm| bytes.saturating_add(arm.source_bytes)),
        )
    }

    pub(super) fn new(selectors: Vec<Complex>, source_bytes: usize) -> Self {
        Self::with_positions(selectors, None, source_bytes)
    }

    pub(super) fn with_jquery(mut selectors: Vec<Complex>, source_bytes: usize) -> Self {
        let positions: Box<[_]> = selectors
            .iter_mut()
            .map(|selector| {
                let position_pseudos: Vec<_> = selector
                    .rest
                    .last()
                    .map_or(&selector.first, |(_, compound)| compound)
                    .pseudos
                    .iter()
                    .enumerate()
                    .filter_map(|(index, pseudo)| match pseudo {
                        super::Pseudo::JqueryPosition(position) => Some((index, *position)),
                        _ => None,
                    })
                    .collect();
                let steps: Vec<_> = position_pseudos
                    .iter()
                    .map(|(index, position)| PositionStep {
                        position: *position,
                        prefix: prefix_before_position(selector, *index),
                    })
                    .collect();
                let subject = selector
                    .rest
                    .last_mut()
                    .map_or(&mut selector.first, |(_, c)| c);
                subject
                    .pseudos
                    .retain(|pseudo| !matches!(pseudo, super::Pseudo::JqueryPosition(_)));
                steps.into_boxed_slice()
            })
            .collect();
        let positions = positions
            .iter()
            .any(|branch| !branch.is_empty())
            .then_some(positions);
        Self::with_positions(selectors, positions, source_bytes)
    }

    fn with_positions(
        selectors: Vec<Complex>,
        positions: Option<Box<[Box<[PositionStep]>]>>,
        source_bytes: usize,
    ) -> Self {
        Self {
            source_bytes,
            #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
            native: std::cell::RefCell::new(
                if positions.is_some()
                    || selectors.iter().any(contains_host_selector)
                    || selectors.iter().any(|selector| {
                        selector
                            .rest
                            .iter()
                            .any(|(comb, _)| matches!(comb, super::Combinator::Custom(..)))
                    })
                {
                    NativeState::Unsupported
                } else {
                    NativeState::Cold
                },
            ),
            selectors: selectors.into(),
            positions,
        }
    }

    #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
    fn native_program(&self) -> Option<Rc<native::Program>> {
        let mut state = self.native.borrow_mut();
        match &*state {
            NativeState::Unsupported => return None,
            NativeState::Cold => {
                *state = NativeState::Seen;
                return None;
            }
            NativeState::Seen => {}
            NativeState::Requested(slot) => {
                if let Some(slot) = slot.upgrade() {
                    return slot.program();
                }
            }
        }
        let slot = native::prepare(&self.selectors)?;
        *state = NativeState::Requested(Rc::downgrade(&slot));
        slot.program()
    }

    #[cfg_attr(
        not(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64"))),
        allow(clippy::unused_self)
    )]
    pub(super) fn begin_document_match(&self) -> bool {
        #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
        {
            let mut state = self.native.borrow_mut();
            if !matches!(*state, NativeState::Cold) {
                return false;
            }
            *state = NativeState::Seen;
        }
        true
    }

    pub(super) fn select_from(&self, tree: &Tree, root: Handle) -> Vec<Handle> {
        if self.positions.is_none() {
            if let Some(results) = tree.query_scoped_bulk_has(root, self) {
                return results;
            }
        }
        if self.selectors.is_empty() {
            return Vec::new();
        }
        if tree.node_type(root) == NodeType::Document && self.positions.is_none() {
            if tree.selector_config().ids_dupes {
                let key = format!("\u{5}{:p}", self.selectors.as_ptr());
                let (candidates, cold_results) = tree.collect_query_candidates(
                    &key,
                    &self.selectors,
                    self.begin_document_match(),
                );
                return cold_results.unwrap_or_else(|| candidates.select(tree, self));
            }
            if self.selectors.len() == 1 {
                let selector = &self.selectors[0];
                let subject = selector
                    .rest
                    .last()
                    .map_or(&selector.first, |(_, compound)| compound);
                if subject.id_is_candidate {
                    if let Some(id) = subject.id.as_deref() {
                        let Some(node) = tree.get_element_by_id(id) else {
                            return Vec::new();
                        };
                        let live = LiveNavigator(tree);
                        return if matches_complex(&live, node, selector) {
                            vec![node]
                        } else {
                            Vec::new()
                        };
                    }
                }
            }
        }
        let scope = (tree.node_type(root) == NodeType::Element).then_some(root);
        let mut result = Vec::new();
        self.visit_selected(tree, root, scope, None, |node| {
            result.push(node);
            false
        });
        result
    }

    pub(super) fn select_in_shadow(&self, tree: &Tree, root: Handle) -> Vec<Handle> {
        let mut result = Vec::new();
        self.visit_selected(tree, root, Some(root), Some(root), |node| {
            result.push(node);
            false
        });
        result
    }

    pub(super) fn closest_from(&self, tree: &Tree, node: Handle) -> Option<Handle> {
        let matches = self.evaluator(tree, Some(node));
        let mut current = Some(node);
        while let Some(element) = current.filter(|&h| tree.node_type(h) == NodeType::Element) {
            if matches(element) {
                return Some(element);
            }
            current = tree.parent(element);
        }
        None
    }

    fn pure_id(&self) -> Option<&str> {
        if self.positions.is_some() || self.selectors.len() != 1 {
            return None;
        }
        let selector = &self.selectors[0];
        if !selector.rest.is_empty() || !selector.first.id_is_candidate {
            return None;
        }
        let c = &selector.first;
        if c.tag.is_some()
            || !c.classes.is_empty()
            || !c.attrs.is_empty()
            || !c.pseudos.is_empty()
            || !matches!(c.namespace, super::TypeNamespace::Default)
        {
            return None;
        }
        c.id.as_deref()
    }

    pub(super) fn first_from(
        &self,
        tree: &Tree,
        root: Handle,
        scope: Option<Handle>,
    ) -> Option<Handle> {
        if self.selectors.is_empty() {
            return None;
        }
        if tree.node_type(root) == NodeType::Document {
            if let Some(id) = self.pure_id() {
                return tree.get_element_by_id(id);
            }
        }
        let mut first = None;
        self.visit_selected(tree, root, scope, None, |node| {
            first = Some(node);
            true
        });
        first
    }

    pub(super) fn first_in_shadow(&self, tree: &Tree, root: Handle) -> Option<Handle> {
        let mut first = None;
        self.visit_selected(tree, root, Some(root), Some(root), |node| {
            first = Some(node);
            true
        });
        first
    }

    pub(super) fn visit_selected(
        &self,
        tree: &Tree,
        root: Handle,
        scope: Option<Handle>,
        shadow_scope: Option<Handle>,
        mut stop: impl FnMut(Handle) -> bool,
    ) {
        let document_id_seed =
            tree.node_type(root) == NodeType::Document && !tree.selector_config().ids_dupes;
        let Some(positions) = &self.positions else {
            if document_id_seed {
                let live = LiveNavigator(tree);
                let scoped = scope.map(|scope| ScopedNavigator {
                    live,
                    scope,
                    shadow_scope,
                });
                let nav: &dyn Navigator =
                    scoped.as_ref().map_or(&live as &dyn Navigator, |nav| nav);
                tree.some_descendant(root, |node| {
                    let selected = self.selectors.iter().any(|selector| {
                        document_id_seed_matches(tree, node, selector)
                            && matches_complex(nav, node, selector)
                    });
                    selected && stop(node)
                });
                return;
            }
            let matches = self.evaluator(tree, scope);
            tree.some_descendant(root, |node| matches(node) && stop(node));
            return;
        };
        let live = LiveNavigator(tree);
        let scoped = scope.map(|scope| ScopedNavigator {
            live,
            scope,
            shadow_scope,
        });
        let nav: &dyn Navigator = scoped.as_ref().map_or(&live as &dyn Navigator, |nav| nav);
        let mut counts = vec![0; positions.len()];
        tree.some_descendant(root, |node| {
            let mut selected = false;
            for ((selector, filters), count) in
                self.selectors.iter().zip(positions.iter()).zip(&mut counts)
            {
                if !document_id_seed || document_id_seed_matches(tree, node, selector) {
                    let mut branch_matches = true;
                    for filter in filters {
                        if !matches_complex(nav, node, &filter.prefix) {
                            branch_matches = false;
                            break;
                        }
                        let accepts_filter = filter.position.matches(*count);
                        *count += 1;
                        if !accepts_filter {
                            branch_matches = false;
                            break;
                        }
                    }
                    selected |= branch_matches && matches_complex(nav, node, selector);
                }
            }
            selected && stop(node)
        });
    }

    pub(super) fn matches_arm(&self, nav: &dyn Navigator, node: Handle, index: usize) -> bool {
        let mut count = 0;
        let positions_match = self.positions.as_ref().is_none_or(|positions| {
            positions[index].iter().all(|step| {
                if !matches_complex(nav, node, &step.prefix) {
                    return false;
                }
                let matches = step.position.matches(count);
                count += 1;
                matches
            })
        });
        positions_match && matches_complex(nav, node, &self.selectors[index])
    }

    pub(super) fn filter_document(
        &self,
        tree: &Tree,
        candidates: impl Iterator<Item = Handle>,
    ) -> Vec<Handle> {
        let nav = LiveNavigator(tree);
        #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
        if let Some(matcher) = self.native_program() {
            return candidates
                .filter(|&h| native::matches(&matcher, &self.selectors, &nav, h))
                .collect();
        }
        candidates
            .filter(|&h| {
                self.selectors
                    .iter()
                    .any(|selector| matches_complex(&nav, h, selector))
            })
            .collect()
    }

    pub(super) fn matches(&self, tree: &Tree, node: Handle, scope: Option<Handle>) -> bool {
        self.evaluator(tree, scope)(node)
    }

    pub(super) fn evaluator<'a>(
        &'a self,
        tree: &'a Tree,
        scope: Option<Handle>,
    ) -> impl Fn(Handle) -> bool + 'a {
        #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
        let program = self.native_program();
        move |node| {
            let live = LiveNavigator(tree);
            let scoped;
            let nav: &dyn Navigator = if let Some(scope) = scope {
                scoped = ScopedNavigator {
                    live,
                    scope,
                    shadow_scope: None,
                };
                &scoped
            } else {
                &live
            };
            #[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
            if let Some(program) = &program {
                return native::matches(program, &self.selectors, nav, node);
            }
            if self.positions.is_some() {
                return (0..self.selectors.len()).any(|index| self.matches_arm(nav, node, index));
            }
            self.selectors
                .iter()
                .any(|selector| matches_complex(nav, node, selector))
        }
    }
}

fn prefix_before_position(selector: &Complex, position_pseudo: usize) -> Complex {
    let original = selector
        .rest
        .last()
        .map_or(&selector.first, |(_, compound)| compound);
    let mut prefix = super::Compound {
        tag: original.tag.clone(),
        namespace: original.namespace,
        ..super::Compound::default()
    };
    for part in &original.order {
        match part {
            super::CompoundPart::Pseudo(index) if *index == position_pseudo => break,
            super::CompoundPart::Pseudo(_) if position_pseudo >= original.pseudos.len() => {
                // The position is represented by a synthetic pseudo appended after parsing.
            }
            super::CompoundPart::Id(id) => {
                prefix.id = Some(id.clone());
                prefix.order.push(super::CompoundPart::Id(id.clone()));
            }
            super::CompoundPart::Class(index) => {
                prefix.classes.push(original.classes[*index].clone());
                prefix
                    .order
                    .push(super::CompoundPart::Class(prefix.classes.len() - 1));
            }
            super::CompoundPart::Attribute(index) => {
                prefix.attrs.push(original.attrs[*index].clone());
                prefix
                    .order
                    .push(super::CompoundPart::Attribute(prefix.attrs.len() - 1));
            }
            super::CompoundPart::Pseudo(index) => {
                let pseudo = &original.pseudos[*index];
                if !matches!(pseudo, super::Pseudo::JqueryPosition(_)) {
                    prefix.pseudos.push(pseudo.clone());
                    prefix
                        .order
                        .push(super::CompoundPart::Pseudo(prefix.pseudos.len() - 1));
                }
            }
        }
    }
    let mut result = selector.clone();
    if let Some((_, subject)) = result.rest.last_mut() {
        *subject = prefix;
    } else {
        result.first = prefix;
    }
    result
}

fn document_id_seed_matches(tree: &Tree, node: Handle, selector: &Complex) -> bool {
    let subject = selector
        .rest
        .last()
        .map_or(&selector.first, |(_, compound)| compound);
    subject
        .id_is_candidate
        .then_some(subject.id.as_deref())
        .flatten()
        .is_none_or(|id| tree.get_element_by_id(id) == Some(node))
}

#[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
fn contains_host_selector(selector: &Complex) -> bool {
    std::iter::once(&selector.first)
        .chain(selector.rest.iter().map(|(_, compound)| compound))
        .flat_map(|compound| compound.pseudos.iter())
        .any(|pseudo| match pseudo {
            super::Pseudo::Host { .. } => true,
            super::Pseudo::Is(list)
            | super::Pseudo::Matches(list)
            | super::Pseudo::Where(list)
            | super::Pseudo::Not(list)
            | super::Pseudo::WebkitAny(list) => list.iter().any(contains_host_selector),
            super::Pseudo::Has(list) => list
                .iter()
                .any(|relative| contains_host_selector(&relative.complex)),
            super::Pseudo::NthChildOf(_, _, list) | super::Pseudo::NthLastChildOf(_, _, list) => {
                list.iter().any(contains_host_selector)
            }
            _ => false,
        })
}

#[cfg(all(
    test,
    feature = "jit",
    any(target_arch = "aarch64", target_arch = "x86_64")
))]
mod tests {
    use super::*;
    use crate::rtdom::query::parse_selector_list_str;

    fn wait_for_native(prepared: &PreparedList) -> Rc<native::Program> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            if let Some(program) = prepared.native_program() {
                return program;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "compiler did not publish"
            );
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    }

    #[test]
    fn native_chain_calls_the_bound_extension_on_live_nodes() {
        use crate::{SelectorArity, SelectorExtensions};

        let mut extensions = SelectorExtensions::default();
        assert!(
            extensions.register_selector("marked", SelectorArity::Flag, |tree, node, _| {
                tree.has_attribute(node, "data-mark")
            })
        );
        let predicate = extensions.compile("main > :marked").unwrap();
        let mut tree = Tree::parse("<main><p id=a data-mark></p><p id=b></p></main>");
        let a = tree.get_element_by_id("a").unwrap();
        let b = tree.get_element_by_id("b").unwrap();

        assert_eq!(predicate.select(&tree, None), [a]);
        let _program = wait_for_native(&predicate.0);
        assert_eq!(predicate.select(&tree, None), [a]);

        tree.remove_attribute(a, "data-mark");
        tree.set_attribute(b, "data-mark", "");
        assert_eq!(predicate.select(&tree, None), [b]);
    }

    #[test]
    fn native_selector_lists_match_the_interpreter() {
        let tree = Tree::parse(
            "<main class=a><div class=b><div class=b><span class=c id=deep data-x=y></span></div></div>
             <i class=before></i>text<b class=next></b><b class=next></b></main><aside class=outside></aside>",
        );
        let cases = [
            ".a",
            ".a > .b",
            ".b > .c",
            "main.a > .b .c[data-x=y]",
            ".before + .next",
            ".before ~ .next",
            ".absent, .a:has(> .b), .outside",
            "main > .absent, .a .c",
            ".missing > .next",
        ];
        let candidates = tree.query_selector_all("*");
        let nav = LiveNavigator(&tree);
        for source in cases {
            let prepared = PreparedList::new(parse_selector_list_str(source), source.len());
            assert!(
                prepared.native_program().is_none(),
                "{source} compiled on first use"
            );
            let _program = wait_for_native(&prepared);
            for &node in candidates.iter() {
                let original = prepared
                    .selectors
                    .iter()
                    .any(|selector| matches_complex(&nav, node, selector));
                assert_eq!(
                    prepared.matches(&tree, node, None),
                    original,
                    "{source} on {node:?}"
                );
            }
        }
        let first = PreparedList::new(parse_selector_list_str(".a > .b .c"), ".a > .b .c".len());
        let same_shape =
            PreparedList::new(parse_selector_list_str(".x > .y .z"), ".x > .y .z".len());
        assert!(Rc::ptr_eq(
            &wait_for_native(&first),
            &wait_for_native(&same_shape)
        ));
    }
}
