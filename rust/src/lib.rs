#![deny(unsafe_code)]

//! Experimental Rust selector matching for NWSAPI v3.
//! The optional `jit` feature adds native code generation on AArch64 and x86-64.

#[cfg(all(feature = "jit", any(target_arch = "aarch64", target_arch = "x86_64")))]
#[allow(unsafe_code)]
pub mod jit;

pub mod has_policy;

use std::collections::HashSet;
use std::hash::Hash;

/// Relationship between a selected element and an element matching its `:has()` argument.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Relationship {
    Child,
    Descendant,
}

/// Keeps the anchors that have at least one witness in the requested relationship.
///
/// The caller supplies anchors and witnesses that already match their respective
/// compounds. Anchors should be unique and in document order. Output preserves
/// their order. The parent callback must return the DOM parent in the same query
/// tree, stopping at the root or an earlier traversal boundary. Its links must
/// be acyclic. Both inputs and the callback must see the same tree snapshot.
pub fn filter_anchors<H: Copy + Eq + Hash>(
    anchors: impl IntoIterator<Item = H>,
    witnesses: impl IntoIterator<Item = H>,
    relationship: Relationship,
    mut parent: impl FnMut(H) -> Option<H>,
) -> Vec<H> {
    let mut marked = HashSet::new();
    for witness in witnesses {
        let mut ancestor = parent(witness);
        while let Some(node) = ancestor {
            // An earlier walk through this node already marked all its ancestors.
            if !marked.insert(node) || relationship == Relationship::Child {
                break;
            }
            ancestor = parent(node);
        }
    }
    anchors
        .into_iter()
        .filter(|anchor| marked.contains(anchor))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{filter_anchors, Relationship};

    #[test]
    fn preserves_anchor_order_and_strict_relationships() {
        // 0 -> (1 -> (2 -> 3, 4), 5 -> 6, 7); 8 is disconnected.
        let parents = [
            None,
            Some(0),
            Some(1),
            Some(2),
            Some(1),
            Some(0),
            Some(5),
            Some(0),
            None,
        ];
        let anchors = [0, 1, 2, 3, 5, 7, 8];
        let witnesses = [6, 4, 3, 3, 8];
        let parent = |node: usize| parents[node];

        assert_eq!(
            filter_anchors(anchors, witnesses, Relationship::Child, parent),
            [1, 2, 5]
        );
        assert_eq!(
            filter_anchors(anchors, witnesses, Relationship::Descendant, parent),
            [0, 1, 2, 5]
        );
        assert!(filter_anchors(anchors, [], Relationship::Descendant, parent).is_empty());
    }
}
