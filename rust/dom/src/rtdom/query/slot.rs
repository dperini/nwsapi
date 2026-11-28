use super::{matches_complex, Complex, Handle, LiveNavigator, NodeType, ScopedNavigator, Tree};

pub(super) fn matches(tree: &Tree, slot: Handle, selector: Option<&Complex>) -> bool {
    if !is_slot(tree, slot) || tree.shadow_root_of(slot).is_none() {
        return false;
    }
    let mut stack = vec![slot];
    while let Some(current) = stack.pop() {
        let Some(root) = tree
            .shadow_root_of(current)
            .filter(|_| is_slot(tree, current))
        else {
            if selector.is_none_or(|selector| {
                matches_complex(
                    &ScopedNavigator {
                        live: LiveNavigator(tree),
                        scope: current,
                        shadow_scope: None,
                    },
                    current,
                    selector,
                )
            }) {
                return true;
            }
            continue;
        };
        let host = tree.shadow_host(root).expect("shadow root has a host");
        let name = tree.get_attribute(current, "name").unwrap_or_default();
        let mut first = None;
        tree.some_descendant(root, |node| {
            if is_slot(tree, node) && tree.get_attribute(node, "name").unwrap_or_default() == name {
                first = Some(node);
                true
            } else {
                false
            }
        });
        let start = stack.len();
        if first == Some(current) {
            tree.for_each_child(host, |child| {
                if slot_name(tree, child) == Some(name) {
                    stack.push(child);
                }
            });
        }
        if start == stack.len() {
            tree.for_each_child(current, |child| {
                if slot_name(tree, child).is_some() {
                    stack.push(child);
                }
            });
        }
        stack[start..].reverse();
    }
    false
}

fn is_slot(tree: &Tree, node: Handle) -> bool {
    tree.local_name_scalar(node) == Some("slot") && tree.is_html(node)
}

fn slot_name(tree: &Tree, node: Handle) -> Option<&str> {
    match tree.node_type(node) {
        NodeType::Element => Some(tree.get_attribute(node, "slot").unwrap_or_default()),
        NodeType::Text => Some(""),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_slotted_distinguishes_default_text_and_named_elements() {
        let mut tree = Tree::parse("<main>text<span class=entry slot=named></span></main>");
        let host = tree.query_selector("main").unwrap();
        let root = tree.attach_shadow(host);
        let default = tree.create_element("slot");
        let named = tree.create_element("slot");
        let duplicate = tree.create_element("slot");
        tree.set_attribute(named, "name", "named");
        tree.set_attribute(duplicate, "name", "named");
        for slot in [default, named, duplicate] {
            tree.append_child(root, slot);
        }
        let any = tree.compile_selector(":has-slotted").unwrap();
        let entries = tree.compile_selector(":has-slotted(.entry)").unwrap();
        assert_eq!(any.select(&tree, Some(root)), [default, named]);
        assert_eq!(entries.select(&tree, Some(root)), [named]);
        assert!(tree
            .compile_selector(":has-slotted(main > .entry)")
            .is_err());
        assert!(tree.compile_selector(":has-slotted(.entry, span)").is_err());
    }
}
