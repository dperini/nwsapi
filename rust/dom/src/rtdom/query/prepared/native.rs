use super::super::{
    class_matches_value, compound_at, matches_compound, Combinator, Complex, Compound, Handle,
    Navigator, NodeType, TypeNamespace,
};
pub(super) use nwsapi_has::jit::background::Program;
use nwsapi_has::jit::background::{self, Job};
use nwsapi_has::jit::{Combinator as NativeCombinator, Host};
use rustc_hash::FxHashMap;
use std::{
    cell::RefCell,
    num::NonZeroUsize,
    rc::Rc,
    sync::mpsc::{Receiver, TryRecvError},
};

#[derive(Eq, Hash, PartialEq)]
enum Key {
    ClassSelector(String),
    Chain(Vec<Vec<NativeCombinator>>),
}

pub(super) struct Slot(RefCell<CompileState>);

enum CompileState {
    Pending(Receiver<Option<Program>>),
    Ready(Option<Rc<Program>>),
}

impl Slot {
    pub(super) fn program(&self) -> Option<Rc<Program>> {
        let mut state = self.0.borrow_mut();
        if let CompileState::Pending(reply) = &*state {
            let result = match reply.try_recv() {
                Ok(result) => result,
                Err(TryRecvError::Disconnected) => None,
                Err(TryRecvError::Empty) => return None,
            };
            *state = CompileState::Ready(result.map(Rc::new));
        }
        match &*state {
            CompileState::Ready(result) => result.clone(),
            CompileState::Pending(_) => None,
        }
    }
}

type CodeCache = FxHashMap<Key, Rc<Slot>>;
const CACHE_CAPACITY: usize = 64;
thread_local! {
    static CODE: RefCell<CodeCache> = RefCell::default();
}

fn single_class(compound: &Compound) -> Option<&str> {
    if compound.tag.is_some()
        || compound.namespace != TypeNamespace::Default
        || compound.id.is_some()
        || !compound.attrs.is_empty()
        || !compound.pseudos.is_empty()
    {
        return None;
    }
    let [class] = compound.classes.as_slice() else {
        return None;
    };
    // Escaped class names can contain combinator punctuation, so only pass
    // literal identifiers to the class compiler.
    class
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        .then_some(class)
}

fn class_source(selectors: &[Complex]) -> Option<String> {
    let [selector] = selectors else {
        return None;
    };
    let head = single_class(&selector.first)?;
    match selector.rest.as_slice() {
        [] => Some(format!(".{head}")),
        [(Combinator::Child, tail)] => Some(format!(".{head}>.{}", single_class(tail)?)),
        _ => None,
    }
}

pub(super) fn prepare(selectors: &[Complex]) -> Option<Rc<Slot>> {
    if selectors.iter().any(|selector| {
        selector
            .rest
            .iter()
            .any(|(combinator, _)| matches!(combinator, Combinator::Column))
    }) {
        return None;
    }
    let key = class_source(selectors).map_or_else(
        || {
            Key::Chain(
                selectors
                    .iter()
                    .map(|selector| {
                        selector
                            .rest
                            .iter()
                            .map(|(combinator, _)| match combinator {
                                Combinator::Child => NativeCombinator::Child,
                                Combinator::Descendant => NativeCombinator::Descendant,
                                Combinator::Adjacent => NativeCombinator::Adjacent,
                                Combinator::GeneralSibling => NativeCombinator::GeneralSibling,
                                Combinator::Custom(..) | Combinator::Column => {
                                    unreachable!("custom chains use the interpreter")
                                }
                            })
                            .collect()
                    })
                    .collect(),
            )
        },
        Key::ClassSelector,
    );

    CODE.with_borrow_mut(|cache| {
        if let Some(slot) = cache.get(&key) {
            return Some(slot.clone());
        }
        let job = match &key {
            Key::ClassSelector(source) => Job::Class(source.clone()),
            Key::Chain(shape) => Job::Chain(shape.clone()),
        };
        let slot = Rc::new(Slot(RefCell::new(CompileState::Pending(
            background::try_compile(job)?,
        ))));
        if cache.len() == CACHE_CAPACITY {
            cache.clear();
        }
        cache.insert(key, slot.clone());
        Some(slot)
    })
}

struct Dom<'a, N: ?Sized> {
    nav: &'a N,
    selectors: &'a [Complex],
}

fn encode(node: Handle) -> NonZeroUsize {
    NonZeroUsize::new(node.raw() as usize + 1).expect("64-bit handle")
}

fn decode(node: NonZeroUsize) -> Handle {
    Handle::from_raw((node.get() - 1) as u32)
}

impl<N: Navigator + ?Sized> Host for Dom<'_, N> {
    fn test(&mut self, node: NonZeroUsize, arm: usize, position: usize) -> bool {
        matches_compound(
            self.nav,
            decode(node),
            compound_at(&self.selectors[arm], position),
        )
    }

    fn parent(&mut self, node: NonZeroUsize) -> Option<NonZeroUsize> {
        self.nav.parent(decode(node)).map(encode)
    }

    fn previous_element_sibling(&mut self, node: NonZeroUsize) -> Option<NonZeroUsize> {
        self.nav.previous_element_sibling(decode(node)).map(encode)
    }
}

pub(super) fn matches<N: Navigator + ?Sized>(
    matcher: &Program,
    selectors: &[Complex],
    nav: &N,
    node: Handle,
) -> bool {
    match matcher {
        Program::Class(matcher) => {
            let tree = nav.tree();
            matcher.matches(
                node,
                |node, class| {
                    tree.node_type(node) == NodeType::Element
                        && tree
                            .get_attribute_ns_borrowed(node, None, "class")
                            .is_some_and(|value| class_matches_value(tree, node, value, class))
                },
                |node| nav.parent(node),
            )
        }
        Program::Chain(matcher) => matcher.matches(encode(node), &mut Dom { nav, selectors }),
    }
}
