use super::{Handle, NodeType, Tree};

macro_rules! selector_states {
    ($($variant:ident $(=> $name:literal)?),+ $(,)?) => {
        /// Element states supplied by the host for DOM selector matching.
        #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
        pub enum SelectorState { $($variant),+ }

        impl SelectorState {
            pub(crate) fn from_pseudo(name: &str) -> Option<Self> {
                match name {
                    $($($name => Some(Self::$variant),)?)+
                    _ => None,
                }
            }
        }
    };
}

selector_states! {
    Active => "active",
    Autofill => "autofill",
    Buffering => "buffering",
    Closed => "closed",
    Current => "current",
    Default => "default",
    Focus => "focus",
    FocusVisible => "focus-visible",
    FocusWithin => "focus-within",
    Future => "future",
    Fullscreen => "fullscreen",
    FullscreenAncestor => "fullscreen-ancestor",
    Hover => "hover",
    Indeterminate => "indeterminate",
    InRange => "in-range",
    Invalid => "invalid",
    Modal => "modal",
    Muted => "muted",
    OutOfRange => "out-of-range",
    Open => "open",
    Past => "past",
    Paused => "paused",
    PictureInPicture => "picture-in-picture",
    PlaceholderShown => "placeholder-shown",
    Playing => "playing",
    PopoverOpen => "popover-open",
    Seeking => "seeking",
    Stalled => "stalled",
    Target => "target",
    Valid => "valid",
    ActiveViewTransition => "active-view-transition",
    InterestSource => "interest-source",
    InterestTarget => "interest-target",
    TargetAfter => "target-after",
    TargetBefore => "target-before",
    TargetCurrent => "target-current",
    UserInvalid => "user-invalid",
    UserValid => "user-valid",
    XrOverlay => "xr-overlay",
    HasOffsetDimensions,
    HostDirectionLtr,
    HostDirectionRtl,
    HostHasSlotted,
    Visited => "visited",
    VolumeLocked => "volume-locked",
}

impl Tree {
    /// Report whether a live element is in this host state.
    ///
    /// Returns whether the state changed. Changes invalidate cached results.
    pub fn set_selector_state(&mut self, node: Handle, state: SelectorState, value: bool) -> bool {
        if !self.is_live(node) || self.node_type(node) != NodeType::Element {
            return false;
        }
        let changed = if value {
            self.selector_states.insert((node, state))
        } else {
            self.selector_states.remove(&(node, state))
        };
        if changed {
            self.bump();
        }
        changed
    }

    /// Apply a host constraint-validation result. Use None for a control barred from validation.
    /// Returns whether the element's validity changed.
    pub fn set_constraint_validity(&mut self, node: Handle, valid: Option<bool>) -> bool {
        if !self.is_live(node) || self.node_type(node) != NodeType::Element {
            return false;
        }
        let mut changed = false;
        for (state, active) in [
            (SelectorState::Valid, Some(true)),
            (SelectorState::Invalid, Some(false)),
        ] {
            changed |= if valid == active {
                self.selector_states.insert((node, state))
            } else {
                self.selector_states.remove(&(node, state))
            };
        }
        if changed {
            self.bump();
        }
        changed
    }

    /// Read an element's host-reported selector state.
    #[must_use]
    pub fn selector_state(&self, node: Handle, state: SelectorState) -> bool {
        self.selector_states.contains(&(node, state))
    }

    pub(crate) fn set_host_functional_state(
        &mut self,
        node: Handle,
        selector: &str,
        value: bool,
    ) -> bool {
        if !self.is_live(node) || self.node_type(node) != NodeType::Element {
            return false;
        }
        let key = (node, selector.to_string());
        let changed = if value {
            self.host_functional_states.insert(key)
        } else {
            self.host_functional_states.remove(&key)
        };
        if changed {
            self.bump();
        }
        true
    }

    pub(crate) fn host_functional_state(&self, node: Handle, selector: &str) -> bool {
        self.host_functional_states
            .contains(&(node, selector.to_string()))
    }

    pub(crate) fn set_host_slotted_selector(
        &mut self,
        node: Handle,
        selector: &str,
        value: bool,
    ) -> bool {
        if !self.is_live(node) || self.node_type(node) != NodeType::Element {
            return false;
        }
        let changed = if value {
            self.host_slotted_selectors
                .entry(node)
                .or_default()
                .insert(selector.to_string())
        } else {
            let Some(selectors) = self.host_slotted_selectors.get_mut(&node) else {
                return true;
            };
            let changed = selectors.remove(selector);
            if selectors.is_empty() {
                self.host_slotted_selectors.remove(&node);
            }
            changed
        };
        if changed {
            self.bump();
        }
        true
    }

    pub(crate) fn host_slotted_selector(&self, node: Handle, selector: &str) -> bool {
        self.host_slotted_selectors
            .get(&node)
            .is_some_and(|selectors| selectors.contains(selector))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_updates_invalidate_cached_queries_and_feed_compiled_plans() {
        let mut tree = Tree::parse("<button id=one></button><div id=two popover></div>");
        let button = tree.get_element_by_id("one").unwrap();
        let popover = tree.get_element_by_id("two").unwrap();
        let plan = tree
            .compile_selector(":focus-visible, :popover-open")
            .unwrap();
        assert!(tree.query_selector_all(":focus-visible").is_empty());
        assert_eq!(plan.select(&tree, None), []);
        assert!(tree.set_selector_state(button, SelectorState::FocusVisible, true));
        assert!(tree.set_selector_state(popover, SelectorState::PopoverOpen, true));
        assert!(!tree.set_selector_state(button, SelectorState::FocusVisible, true));
        assert_eq!(&*tree.query_selector_all(":focus-visible"), [button]);
        assert_eq!(plan.select(&tree, None), [button, popover]);
        assert!(tree.set_selector_state(button, SelectorState::FocusVisible, false));
        assert!(tree.query_selector_all(":focus-visible").is_empty());
        assert_eq!(plan.select(&tree, None), [popover]);
    }
}
