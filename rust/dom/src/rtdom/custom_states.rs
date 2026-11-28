//! Native custom states are separate from attributes and mutation records.
use super::{Handle, NodeType, Tree};
use rustc_hash::FxHashSet;

impl Tree {
    /// Add or remove an exact DOM string state. Returns whether membership changed.
    /// Invalid, reclaimed and non-element handles are ignored. State changes bump
    /// the tree version for selector/style caches without generating DOM mutations.
    pub fn set_custom_state_utf16(&mut self, node: Handle, state: &[u16], present: bool) -> bool {
        if !self.is_live(node) || self.node_type(node) != NodeType::Element {
            return false;
        }
        let changed = if present {
            let states = self.custom_states.entry(node).or_default();
            if states.contains(state) {
                false
            } else {
                states.insert(state.into())
            }
        } else {
            self.custom_states
                .get_mut(&node)
                .is_some_and(|states| states.remove(state))
        };
        if self
            .custom_states
            .get(&node)
            .is_some_and(FxHashSet::is_empty)
        {
            self.custom_states.remove(&node);
        }
        if changed {
            self.bump_node(node);
            self.bump_form_change(node, "");
        }
        changed
    }

    /// Test exact UTF-16 membership without allocating. Invalid/non-elements return false.
    #[must_use]
    pub fn has_custom_state_utf16(&self, node: Handle, state: &[u16]) -> bool {
        self.custom_states
            .get(&node)
            .is_some_and(|states| states.contains(state))
    }

    /// Clear native states without attributes or mutation records. Returns whether changed.
    pub fn clear_custom_states(&mut self, node: Handle) -> bool {
        if self.custom_states.remove(&node).is_some() {
            self.bump_node(node);
            self.bump_form_change(node, "");
            true
        } else {
            false
        }
    }

    /// Copy exact state keys for native adoption between trees. Order is unspecified;
    /// the embedding `CustomStateSet` retains its own observable insertion order.
    /// Clone/import must not copy these states. Invalid/non-elements return empty.
    #[must_use]
    pub fn custom_states_utf16(&self, node: Handle) -> Vec<Vec<u16>> {
        self.custom_states
            .get(&node)
            .map_or_else(Vec::new, |states| {
                states.iter().map(|state| state.to_vec()).collect()
            })
    }

    pub(super) fn custom_state_payload_bytes(&self, retained: Option<&FxHashSet<Handle>>) -> usize {
        self.custom_states
            .iter()
            .filter(|(node, _)| retained.is_none_or(|handles| handles.contains(node)))
            .map(|(_, states)| states.iter().map(|state| state.len() * 2).sum::<usize>())
            .sum()
    }
}
