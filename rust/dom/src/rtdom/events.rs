//! Event dispatch for the Rust-native runtime. Mirrors the JS `events.mjs`
//! model: capture → target → bubble phases over an ancestor path, the
//! listener-less fast-skip (no path phases run when nothing listens), and
//! stopPropagation / stopImmediatePropagation / preventDefault.
//!
//! Listeners are Rust closures `FnMut(&mut Tree, &mut Event)` — a handler may
//! mutate the tree mid-dispatch (React re-renders on events). To satisfy the
//! borrow checker we move the listener registry out of `Dom` for the duration
//! of dispatch (snapshot semantics, like the JS listener-slice copy), call each
//! handler with `&mut self.tree`, then restore — preserving any listeners added
//! during dispatch.

use super::tree::{Handle, Tree};
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    None = 0,
    Capturing = 1,
    AtTarget = 2,
    Bubbling = 3,
}

pub struct Event {
    pub event_type: String,
    pub bubbles: bool,
    pub cancelable: bool,
    /// The dispatch target — `None` until `dispatch_event` sets it. Modeled as an
    /// `Option` (not a sentinel handle) because `Handle(0)` is the document root: a
    /// pre-dispatch read of a sentinel would silently claim the event targets the
    /// document. Same "no impossible states" rule as the `parent_ov` pointer.
    pub target: Option<Handle>,
    /// The node whose listeners are running right now — `Some` only during dispatch,
    /// cleared back to `None` when dispatch ends.
    pub current_target: Option<Handle>,
    pub phase: Phase,
    default_prevented: bool,
    propagation_stopped: bool,
    immediate_stopped: bool,
}

impl Event {
    #[must_use]
    pub fn new(event_type: &str, bubbles: bool, cancelable: bool) -> Event {
        Event {
            event_type: event_type.to_string(),
            bubbles,
            cancelable,
            target: None,
            current_target: None,
            phase: Phase::None,
            default_prevented: false,
            propagation_stopped: false,
            immediate_stopped: false,
        }
    }
    pub fn prevent_default(&mut self) {
        if self.cancelable {
            self.default_prevented = true;
        }
    }
    pub fn stop_propagation(&mut self) {
        self.propagation_stopped = true;
    }
    pub fn stop_immediate_propagation(&mut self) {
        self.propagation_stopped = true;
        self.immediate_stopped = true;
    }
    #[must_use]
    pub fn default_prevented(&self) -> bool {
        self.default_prevented
    }
}

type Callback = Box<dyn FnMut(&mut Tree, &mut Event)>;

struct Listener {
    event_type: String,
    capture: bool,
    once: bool,
    id: u64,
    cb: Callback,
}

/// A DOM with an event-listener registry. Owns the `Tree`.
pub struct Dom {
    pub tree: Tree,
    listeners: HashMap<Handle, Vec<Listener>>,
    next_id: u64,
}

impl Dom {
    pub fn new(tree: Tree) -> Dom {
        Dom {
            tree,
            listeners: HashMap::new(),
            next_id: 0,
        }
    }
    #[must_use]
    pub fn parse(html: &str) -> Dom {
        Dom::new(Tree::parse(html))
    }

    /// Register a listener. Returns an id usable with `remove_event_listener`.
    pub fn add_event_listener(
        &mut self,
        target: Handle,
        event_type: &str,
        capture: bool,
        once: bool,
        cb: Callback,
    ) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        // dedupe by (type, capture) like the JS Set-of-listeners? JS allows the
        // same fn once per (type,capture); here ids are unique so just push.
        self.listeners.entry(target).or_default().push(Listener {
            event_type: event_type.to_string(),
            capture,
            once,
            id,
            cb,
        });
        id
    }

    pub fn remove_event_listener(&mut self, target: Handle, id: u64) {
        if let Some(v) = self.listeners.get_mut(&target) {
            v.retain(|l| l.id != id);
        }
    }

    fn path_has_listener(&self, path: &[Handle], event_type: &str) -> bool {
        path.iter().any(|h| {
            self.listeners
                .get(h)
                .is_some_and(|v| v.iter().any(|l| l.event_type == event_type))
        })
    }

    fn run_dispatch_phases(
        &mut self,
        target: Handle,
        event: &mut Event,
        path: &[Handle],
        registry: &mut std::collections::HashMap<Handle, Vec<Listener>>,
    ) {
        for phase in [Phase::Capturing, Phase::AtTarget, Phase::Bubbling] {
            if phase == Phase::Bubbling && !event.bubbles {
                break;
            }
            let nodes: Vec<Handle> = match phase {
                Phase::Capturing => path[1..].iter().rev().copied().collect(),
                Phase::AtTarget => vec![target],
                _ => path[1..].to_vec(),
            };
            if self.run_phase_nodes(&nodes, phase, event, registry) {
                break;
            }
        }
    }

    fn run_phase_nodes(
        &mut self,
        nodes: &[Handle],
        phase: Phase,
        event: &mut Event,
        registry: &mut std::collections::HashMap<Handle, Vec<Listener>>,
    ) -> bool {
        for &node in nodes {
            if event.propagation_stopped && phase != Phase::AtTarget {
                return true;
            }
            event.current_target = Some(node);
            event.phase = phase;
            if let Some(list) = registry.get_mut(&node) {
                self.invoke_listeners_on_node(list, phase, event);
            }
            if event.propagation_stopped && (phase == Phase::Bubbling || phase == Phase::Capturing)
            {
                return true;
            }
        }
        false
    }

    fn invoke_listeners_on_node(
        &mut self,
        list: &mut Vec<Listener>,
        phase: Phase,
        event: &mut Event,
    ) {
        let n = list.len();
        let mut i = 0;
        while i < n.min(list.len()) {
            let want = match phase {
                Phase::Capturing => list[i].capture,
                Phase::AtTarget => true,
                _ => !list[i].capture,
            };
            if want && list[i].event_type == event.event_type {
                let mut cb = std::mem::replace(&mut list[i].cb, Box::new(|_, _| {}));
                cb(&mut self.tree, event);
                if i < list.len() {
                    list[i].cb = cb;
                }
                if list.get(i).is_some_and(|l| l.once) {
                    list.remove(i);
                    if event.immediate_stopped {
                        break;
                    }
                    continue;
                }
                if event.immediate_stopped {
                    break;
                }
            }
            i += 1;
        }
    }

    /// Dispatch. Returns `!default_prevented` (the DOM `dispatchEvent` contract).
    pub fn dispatch_event(&mut self, target: Handle, event: &mut Event) -> bool {
        // Build the ancestor path target..root (one walk).
        let mut path = vec![target];
        let mut cur = self.tree.parent(target);
        while let Some(p) = cur {
            path.push(p);
            cur = self.tree.parent(p);
        }
        event.target = Some(target);

        // Listener-less fast path: skip all phase work (matches JS hasListener gate).
        if !self.path_has_listener(&path, &event.event_type) {
            event.phase = Phase::None;
            return !event.default_prevented;
        }

        // Snapshot the registry out so handlers can &mut self.tree freely.
        let mut registry = std::mem::take(&mut self.listeners);

        self.run_dispatch_phases(target, event, &path, &mut registry);

        // Restore the snapshotted registry. A handler's signature is
        // `FnMut(&mut Tree, &mut Event)` — no `&mut Dom` — so it cannot register
        // a listener mid-dispatch; `self.listeners` is still empty here.
        self.listeners = registry;

        event.phase = Phase::None;
        event.current_target = None;
        !event.default_prevented
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    fn find(dom: &Dom, tag: &str) -> Handle {
        dom.tree.get_elements_by_tag_name(tag)[0]
    }

    #[test]
    fn bubbles_through_ancestors_in_order() {
        let mut dom = Dom::parse("<div><section><button>x</button></section></div>");
        let button = find(&dom, "button");
        let section = find(&dom, "section");
        let div = find(&dom, "div");
        let log = Rc::new(RefCell::new(Vec::<&'static str>::new()));
        let (l1, l2, l3) = (log.clone(), log.clone(), log.clone());
        dom.add_event_listener(
            button,
            "click",
            false,
            false,
            Box::new(move |_, _| l1.borrow_mut().push("button")),
        );
        dom.add_event_listener(
            section,
            "click",
            false,
            false,
            Box::new(move |_, _| l2.borrow_mut().push("section")),
        );
        dom.add_event_listener(
            div,
            "click",
            false,
            false,
            Box::new(move |_, _| l3.borrow_mut().push("div")),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(button, &mut ev);
        assert_eq!(*log.borrow(), vec!["button", "section", "div"]);
    }

    #[test]
    fn capture_runs_before_target() {
        let mut dom = Dom::parse("<div><button>x</button></div>");
        let button = find(&dom, "button");
        let div = find(&dom, "div");
        let log = Rc::new(RefCell::new(Vec::<&'static str>::new()));
        let (lc, lt) = (log.clone(), log.clone());
        dom.add_event_listener(
            div,
            "click",
            true,
            false,
            Box::new(move |_, _| lc.borrow_mut().push("div-capture")),
        );
        dom.add_event_listener(
            button,
            "click",
            false,
            false,
            Box::new(move |_, _| lt.borrow_mut().push("button-target")),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(button, &mut ev);
        assert_eq!(*log.borrow(), vec!["div-capture", "button-target"]);
    }

    #[test]
    fn stop_propagation_halts_bubble() {
        let mut dom = Dom::parse("<div><button>x</button></div>");
        let button = find(&dom, "button");
        let div = find(&dom, "div");
        let hit = Rc::new(RefCell::new(false));
        let h = hit.clone();
        dom.add_event_listener(
            button,
            "click",
            false,
            false,
            Box::new(|_, e| e.stop_propagation()),
        );
        dom.add_event_listener(
            div,
            "click",
            false,
            false,
            Box::new(move |_, _| *h.borrow_mut() = true),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(button, &mut ev);
        assert!(!*hit.borrow());
    }

    #[test]
    fn prevent_default_reflected_in_return() {
        let mut dom = Dom::parse("<a href=x>link</a>");
        let a = find(&dom, "a");
        dom.add_event_listener(
            a,
            "click",
            false,
            false,
            Box::new(|_, e| e.prevent_default()),
        );
        let mut ev = Event::new("click", true, true);
        let ok = dom.dispatch_event(a, &mut ev);
        assert!(!ok);
        assert!(ev.default_prevented());
    }

    #[test]
    fn listener_can_mutate_tree() {
        let mut dom = Dom::parse("<ul><li>1</li></ul>");
        let ul = find(&dom, "ul");
        dom.add_event_listener(
            ul,
            "add",
            false,
            false,
            Box::new(|tree, _| {
                let li = tree.create_element("li");
                tree.append_child(ul_of(tree), li);
            }),
        );
        let mut ev = Event::new("add", true, false);
        dom.dispatch_event(ul, &mut ev);
        assert_eq!(dom.tree.get_elements_by_tag_name("li").len(), 2);
    }

    fn ul_of(tree: &Tree) -> Handle {
        tree.get_elements_by_tag_name("ul")[0]
    }

    #[test]
    fn listener_less_is_fast_skip() {
        let mut dom = Dom::parse("<div><span>x</span></div>");
        let span = find(&dom, "span");
        let mut ev = Event::new("click", true, true);
        // no listeners anywhere -> dispatch returns true, no panic, phase stays None
        assert!(dom.dispatch_event(span, &mut ev));
        assert_eq!(ev.phase, Phase::None);
    }

    #[test]
    fn once_listener_fires_only_once() {
        let mut dom = Dom::parse("<button>x</button>");
        let b = find(&dom, "button");
        let count = Rc::new(RefCell::new(0));
        let c = count.clone();
        dom.add_event_listener(
            b,
            "click",
            false,
            true,
            Box::new(move |_, _| *c.borrow_mut() += 1),
        );
        for _ in 0..3 {
            let mut ev = Event::new("click", true, true);
            dom.dispatch_event(b, &mut ev);
        }
        assert_eq!(*count.borrow(), 1);
    }

    // stopImmediatePropagation: two listeners on the SAME node; the 2nd must NOT
    // fire (covers stop_immediate_propagation + the immediate-stop break ~197).
    #[test]
    fn stop_immediate_propagation_skips_later_listener_same_node() {
        let mut dom = Dom::parse("<button>x</button>");
        let b = find(&dom, "button");
        let log = Rc::new(RefCell::new(Vec::<&'static str>::new()));
        let (l1, l2) = (log.clone(), log.clone());
        dom.add_event_listener(
            b,
            "click",
            false,
            false,
            Box::new(move |_, e| {
                l1.borrow_mut().push("first");
                e.stop_immediate_propagation();
            }),
        );
        dom.add_event_listener(
            b,
            "click",
            false,
            false,
            Box::new(move |_, _| l2.borrow_mut().push("second")),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(b, &mut ev);
        assert_eq!(*log.borrow(), vec!["first"]);
    }

    // A `once` listener that stops immediate propagation: after removal the loop
    // must break (covers the break ~192 after the once-removal branch).
    #[test]
    fn once_listener_stop_immediate_breaks() {
        let mut dom = Dom::parse("<button>x</button>");
        let b = find(&dom, "button");
        let log = Rc::new(RefCell::new(Vec::<&'static str>::new()));
        let (l1, l2) = (log.clone(), log.clone());
        dom.add_event_listener(
            b,
            "click",
            false,
            true,
            Box::new(move |_, e| {
                l1.borrow_mut().push("once");
                e.stop_immediate_propagation();
            }),
        );
        dom.add_event_listener(
            b,
            "click",
            false,
            false,
            Box::new(move |_, _| l2.borrow_mut().push("second")),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(b, &mut ev);
        assert_eq!(*log.borrow(), vec!["once"]);
    }

    // remove_event_listener: add, remove by id, dispatch -> handler not called
    // (covers remove_event_listener ~115-117).
    #[test]
    fn remove_event_listener_prevents_call() {
        let mut dom = Dom::parse("<button>x</button>");
        let b = find(&dom, "button");
        let hit = Rc::new(RefCell::new(false));
        let h = hit.clone();
        let id = dom.add_event_listener(
            b,
            "click",
            false,
            false,
            Box::new(move |_, _| *h.borrow_mut() = true),
        );
        dom.remove_event_listener(b, id);
        // also exercise the no-such-target branch (no panic)
        dom.remove_event_listener(Handle(99999), id);
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(b, &mut ev);
        assert!(!*hit.borrow());
    }

    // A non-bubbling event only fires capture + target, never bubble
    // (covers the `break` at ~152 when phase == Bubbling && !bubbles).
    #[test]
    fn non_bubbling_event_skips_bubble_phase() {
        let mut dom = Dom::parse("<div><button>x</button></div>");
        let button = find(&dom, "button");
        let div = find(&dom, "div");
        let log = Rc::new(RefCell::new(Vec::<&'static str>::new()));
        let (lc, lt, lb) = (log.clone(), log.clone(), log.clone());
        // capture on ancestor, target listener, and a bubble listener on ancestor
        dom.add_event_listener(
            div,
            "focus",
            true,
            false,
            Box::new(move |_, _| lc.borrow_mut().push("div-capture")),
        );
        dom.add_event_listener(
            button,
            "focus",
            false,
            false,
            Box::new(move |_, _| lt.borrow_mut().push("button-target")),
        );
        dom.add_event_listener(
            div,
            "focus",
            false,
            false,
            Box::new(move |_, _| lb.borrow_mut().push("div-bubble")),
        );
        let mut ev = Event::new("focus", false, false); // bubbles = false
        dom.dispatch_event(button, &mut ev);
        assert_eq!(*log.borrow(), vec!["div-capture", "button-target"]);
    }

    // The registry is std::mem::take()-en out during dispatch and restored after;
    // listeners must persist across dispatches (exercises the take/restore +
    // merge-back path). The cb signature is FnMut(&mut Tree, &mut Event) — it has
    // no &mut Dom — so a handler cannot register NEW listeners mid-dispatch, hence
    // `added` is always empty and the literal append at ~215 is unreachable from a
    // test (documented in the task report). This verifies the restore is lossless.
    #[test]
    fn listeners_persist_across_dispatch() {
        let mut dom = Dom::parse("<button>x</button>");
        let b = find(&dom, "button");
        let count = Rc::new(RefCell::new(0));
        let c = count.clone();
        dom.add_event_listener(
            b,
            "click",
            false,
            false,
            Box::new(move |_, _| *c.borrow_mut() += 1),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(b, &mut ev);
        let mut ev2 = Event::new("click", true, true);
        dom.dispatch_event(b, &mut ev2);
        assert_eq!(*count.borrow(), 2);
    }

    // current_target / event_phase observed INSIDE a handler, and a capture
    // listener on an ancestor that fires before the target — also exercises the
    // stop_propagation break in the capture phase (~206).
    #[test]
    fn current_target_and_phase_inside_handler() {
        let mut dom = Dom::parse("<div><button>x</button></div>");
        let button = find(&dom, "button");
        let div = find(&dom, "div");
        let seen = Rc::new(RefCell::new(Vec::<(Option<Handle>, Phase)>::new()));
        let s1 = seen.clone();
        // capture on ancestor: observes current_target == div, phase == Capturing,
        // then stops propagation -> target listener must NOT run, break 'outer (~206).
        dom.add_event_listener(
            div,
            "click",
            true,
            false,
            Box::new(move |_, e| {
                s1.borrow_mut().push((e.current_target, e.phase));
                e.stop_propagation();
            }),
        );
        let target_hit = Rc::new(RefCell::new(false));
        let th = target_hit.clone();
        dom.add_event_listener(
            button,
            "click",
            false,
            false,
            Box::new(move |_, _| *th.borrow_mut() = true),
        );
        let mut ev = Event::new("click", true, true);
        dom.dispatch_event(button, &mut ev);
        assert_eq!(*seen.borrow(), vec![(Some(div), Phase::Capturing)]);
        assert!(!*target_hit.borrow());
        // after dispatch, phase resets to None and current_target cleared.
        assert_eq!(ev.phase, Phase::None);
        assert_eq!(ev.current_target, None);
    }

    // A fresh Event has NO target — reading it before dispatch must not report the
    // document root (`Handle(0)`), which is what a sentinel handle would do (issue #4).
    #[test]
    fn target_is_none_until_dispatch() {
        let mut dom = Dom::parse("<div><button>x</button></div>");
        let button = find(&dom, "button");
        let mut ev = Event::new("click", true, true);
        assert_eq!(
            ev.target, None,
            "unset target is None, not the document root"
        );
        assert_eq!(ev.current_target, None);
        // the listener-less fast path still sets target...
        dom.dispatch_event(button, &mut ev);
        assert_eq!(ev.target, Some(button));
        assert_eq!(ev.current_target, None, "cleared outside dispatch");
        // ...and so does the full dispatch path, as seen from inside a handler.
        let seen = Rc::new(RefCell::new(None));
        let s1 = seen.clone();
        dom.add_event_listener(
            button,
            "click",
            false,
            false,
            Box::new(move |_, e| {
                *s1.borrow_mut() = e.target;
            }),
        );
        let mut ev2 = Event::new("click", true, true);
        dom.dispatch_event(button, &mut ev2);
        assert_eq!(*seen.borrow(), Some(button));
    }
}
