//! The HTML custom element state of an element (`:defined`, miaskiewicz/turbo-dom#24).
//!
//! The state is fixed when an element is created and changes only through custom element
//! upgrade or construction, which an embedder that runs scripts (the V8 binding) reports
//! with [`Tree::set_custom_element_state`]. Without such a report the tree derives the
//! creation-time state: an HTML element whose local name is a valid custom element name, or
//! that the parser created with an `is` attribute, is "undefined" (no definitions exist
//! without an embedder); every other element is "uncustomized". The `is` attribute counts
//! only as the parser saw it — an `is` attribute set, changed or removed later never changes
//! the state (HTML: the `is` value is read once, at creation). Storage collection
//! ([`Tree::collect_unreachable`]) records that parsed state before it drops the parse buffer
//! (miaskiewicz/turbo-surf#41).
use super::{Handle, NodeType, Tree};

/// HTML's custom element state. `:defined` matches [`Uncustomized`](Self::Uncustomized)
/// and [`Custom`](Self::Custom).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CustomElementState {
    /// A custom element (or customized built-in) not upgraded yet.
    Undefined,
    /// Its constructor threw during upgrade or creation.
    Failed,
    /// A plain element (not custom).
    Uncustomized,
    /// Being upgraded: the constructor is running.
    Precustomized,
    /// Upgraded or constructed by its definition.
    Custom,
}

impl CustomElementState {
    /// Does `:defined` match an element in this state?
    #[must_use]
    pub fn is_defined(self) -> bool {
        matches!(self, Self::Uncustomized | Self::Custom)
    }
}

/// HTML's "valid custom element name" for the names the HTML parser and `createElement`
/// produce: lowercase ASCII start, a hyphen, no ASCII uppercase, not reserved.
pub(crate) fn is_custom_element_name(name: &str) -> bool {
    const RESERVED: &[&str] = &[
        "annotation-xml",
        "color-profile",
        "font-face",
        "font-face-src",
        "font-face-uri",
        "font-face-format",
        "font-face-name",
        "missing-glyph",
    ];
    name.starts_with(|c: char| c.is_ascii_lowercase())
        && name.contains('-')
        && !name.chars().any(|c| c.is_ascii_uppercase())
        && !RESERVED.contains(&name)
}

impl Tree {
    /// The element's custom element state: the embedder's report, else the creation-time
    /// state (see the module docs). Non-elements and non-HTML elements are uncustomized.
    #[must_use]
    pub fn custom_element_state(&self, h: Handle) -> CustomElementState {
        if let Some(&state) = self.custom_element_states.get(&h) {
            return state;
        }
        if self.node_type(h) != NodeType::Element
            || self.namespace_uri(h) != Some("http://www.w3.org/1999/xhtml")
        {
            return CustomElementState::Uncustomized;
        }
        if self.local_name(h).is_some_and(is_custom_element_name) || self.parsed_is_value(h) {
            CustomElementState::Undefined
        } else {
            CustomElementState::Uncustomized
        }
    }

    /// Report an element's custom element state (an embedder that upgrades or constructs
    /// custom elements). Returns whether the effective state changed; a change bumps the
    /// tree version so cached queries and computed styles see it. Invalid, reclaimed and
    /// non-element handles are ignored.
    pub fn set_custom_element_state(&mut self, h: Handle, state: CustomElementState) -> bool {
        if !self.is_live(h) || self.node_type(h) != NodeType::Element {
            return false;
        }
        let before = self.custom_element_state(h);
        self.custom_element_states.insert(h, state);
        let changed = before != state;
        if changed {
            self.bump_node(h);
            self.bump_form_change(h, "");
        }
        changed
    }

    /// The state a copy of `source` starts in (clone, import, adoption into another tree):
    /// an element created with an `is` value or a custom element name is "undefined" until
    /// its definition upgrades it; anything else is uncustomized. Record it on `copy` with
    /// [`Tree::set_custom_element_state`].
    #[must_use]
    pub fn custom_element_copy_state(&self, source: Handle) -> CustomElementState {
        match self.custom_element_state(source) {
            CustomElementState::Uncustomized => CustomElementState::Uncustomized,
            _ => CustomElementState::Undefined,
        }
    }

    /// Record the creation-time state of the parser-created elements among `nodes` that
    /// derive it from their parse-buffer `is` attribute (and have no report), so it survives
    /// storage collection re-materializing them as new nodes (miaskiewicz/turbo-surf#41).
    pub(super) fn record_parsed_states(&mut self, nodes: impl IntoIterator<Item = Handle>) {
        let parsed: Vec<Handle> = nodes
            .into_iter()
            .filter(|&h| {
                !self.custom_element_states.contains_key(&h)
                    && self.parsed_is_value(h)
                    && self.custom_element_state(h) == CustomElementState::Undefined
            })
            .collect();
        for h in parsed {
            self.custom_element_states
                .insert(h, CustomElementState::Undefined);
        }
    }

    /// A parser-created (buffer) element's original `is` attribute, ignoring later edits.
    /// Elements the parser adds after the initial parse (`innerHTML`, fragments) get an
    /// explicit state when they are imported instead.
    fn parsed_is_value(&self, h: Handle) -> bool {
        if self.is_new(h) {
            return false;
        }
        let start = self.buf.attr_start[h.idx()];
        if start < 0 {
            return false;
        }
        (start as usize..start as usize + self.buf.attr_count[h.idx()] as usize).any(|index| {
            self.buf.attr_prefixes[self.buf.attr_prefix_id[index] as usize].is_empty()
                && self.buf.attr_names[self.buf.attr_name_id[index] as usize] == "is"
        })
    }
}
