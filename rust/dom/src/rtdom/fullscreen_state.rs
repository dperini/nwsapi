//! The document's fullscreen stack (`:fullscreen`, miaskiewicz/turbo-dom#58).
//!
//! Only an embedder that runs scripts and grants user activation (the V8 binding's
//! `requestFullscreen()` / `exitFullscreen()`) puts elements in fullscreen; it reports the
//! stack with [`Tree::set_fullscreen_stack`]. A parsed or static document has none, so the
//! fullscreen pseudo-classes match nothing, as in Chrome 156 before any request.
use super::{Handle, NodeType, Tree};

impl Tree {
    /// The fullscreen stack, bottom first: the last entry is the document's fullscreen
    /// element. Empty unless an embedder reported one.
    #[must_use]
    pub fn fullscreen_stack(&self) -> &[Handle] {
        &self.fullscreen_stack
    }

    /// The fullscreen element (the top of the stack), if any.
    #[must_use]
    pub fn fullscreen_element(&self) -> Option<Handle> {
        self.fullscreen_stack.last().copied()
    }

    /// Is `h` in the fullscreen stack used by `:fullscreen`?
    #[must_use]
    pub fn is_fullscreen(&self, h: Handle) -> bool {
        self.fullscreen_stack.contains(&h)
    }

    /// Is `h` a shadow-including ancestor of the fullscreen element (the top of the stack)?
    #[must_use]
    pub fn is_fullscreen_ancestor(&self, h: Handle) -> bool {
        let Some(top) = self.fullscreen_element() else {
            return false;
        };
        let mut node = self.parent(top).or_else(|| self.shadow_host(top));
        while let Some(current) = node {
            if current == h {
                return true;
            }
            node = self.parent(current).or_else(|| self.shadow_host(current));
        }
        false
    }

    /// Report the fullscreen stack (bottom first). Returns whether it changed; a change bumps
    /// the tree version so cached queries and computed styles see it. Entries that are not
    /// live elements are dropped.
    pub fn set_fullscreen_stack(&mut self, stack: &[Handle]) -> bool {
        let stack: Vec<Handle> = stack
            .iter()
            .copied()
            .filter(|&h| self.is_live(h) && self.node_type(h) == NodeType::Element)
            .collect();
        if stack == self.fullscreen_stack {
            return false;
        }
        self.fullscreen_stack = stack;
        self.bump();
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(tree: &Tree, selector: &str) -> Vec<String> {
        tree.query_selector_all(selector)
            .iter()
            .map(|&h| tree.get_attribute(h, "id").unwrap_or_default().to_string())
            .collect()
    }

    #[test]
    fn fullscreen_pseudo_classes_follow_the_reported_stack() {
        let mut tree = Tree::parse("<div id=a><p id=b>b</p><span id=c></span></div><i id=d></i>");
        let (a, b, d) = (
            tree.get_element_by_id("a").unwrap(),
            tree.get_element_by_id("b").unwrap(),
            tree.get_element_by_id("d").unwrap(),
        );
        assert_eq!(ids(&tree, ":fullscreen").len(), 0);
        assert_eq!(tree.fullscreen_element(), None);
        let version = tree.version;
        assert!(tree.set_fullscreen_stack(&[a]));
        assert!(tree.version > version);
        assert!(!tree.set_fullscreen_stack(&[a]), "unchanged stack");
        assert_eq!(ids(&tree, ":fullscreen"), ["a"]);
        assert_eq!(ids(&tree, ":FULLSCREEN"), ["a"]);
        assert_eq!(ids(&tree, "div:not(:fullscreen)"), Vec::<String>::new());
        assert!(tree.is_fullscreen_ancestor(tree.query_selector("body").unwrap()));
        // Nested: every stacked element is :fullscreen; ancestors are the top's.
        assert!(tree.set_fullscreen_stack(&[a, b]));
        assert_eq!(tree.fullscreen_stack(), &[a, b]);
        assert_eq!(tree.fullscreen_element(), Some(b));
        assert_eq!(ids(&tree, ":fullscreen"), ["a", "b"]);
        assert!(tree.is_fullscreen_ancestor(a));
        assert!(!tree.is_fullscreen_ancestor(b));
        assert!(!tree.is_fullscreen_ancestor(d));
        // Non-elements and dead handles are dropped.
        let text = tree.first_child(b).unwrap();
        assert!(tree.set_fullscreen_stack(&[text, d]));
        assert_eq!(tree.fullscreen_stack(), &[d]);
        assert!(tree.set_fullscreen_stack(&[]));
        assert!(!tree.is_fullscreen(d) && !tree.is_fullscreen_ancestor(a));
    }

    #[test]
    fn fullscreen_ancestors_cross_shadow_roots() {
        let mut tree = Tree::parse("<div id=host></div>");
        let host = tree.get_element_by_id("host").unwrap();
        let root = tree.attach_shadow(host);
        let inner = tree.create_element("div");
        tree.append_child(root, inner);
        assert!(tree.set_fullscreen_stack(&[inner]));
        assert!(tree.is_fullscreen_ancestor(host));
        assert!(tree.is_fullscreen_ancestor(host));
        assert!(!tree.matches(host, ":fullscreen"));
        assert!(tree.matches(inner, ":fullscreen"));
        // The document's query never reaches the shadow tree.
        assert_eq!(ids(&tree, ":fullscreen").len(), 0);
    }
}
