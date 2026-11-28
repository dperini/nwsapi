//! The optional selector examples shipped by NWSAPI's jQuery extension.
use super::{Handle, NodeType, Pseudo, Tree};
use crate::SelectorState;

#[derive(Clone, Copy, Debug)]
pub(super) enum Position {
    Even,
    Odd,
    Eq(i128),
    Lt(i128),
    Gt(i128),
}

impl Position {
    pub(super) fn matches(self, index: usize) -> bool {
        let index = i128::try_from(index).unwrap_or(i128::MAX);
        match self {
            Self::Even => index % 2 == 0,
            Self::Odd => index % 2 == 1,
            Self::Eq(n) => index == n,
            Self::Lt(n) => index < n,
            Self::Gt(n) => index > n,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) enum Test {
    InputType(&'static str),
    Button,
    Input,
    Header,
    Visible(bool),
    Parent,
    TagIndex(i128),
    TagLast,
}

pub(super) fn is_name(name: &str) -> bool {
    matches!(
        name,
        "even"
            | "odd"
            | "eq"
            | "lt"
            | "gt"
            | "first"
            | "last"
            | "nth"
            | "checkbox"
            | "file"
            | "image"
            | "password"
            | "radio"
            | "reset"
            | "submit"
            | "text"
            | "button"
            | "input"
            | "header"
            | "hidden"
            | "visible"
            | "parent"
    )
}

pub(super) fn parse(name: &str, arg: Option<&str>) -> Option<Pseudo> {
    if let Some(arg) = arg {
        let index = arg.trim().parse::<i128>().ok()?;
        if index.unsigned_abs() > 9_007_199_254_740_991 {
            return None;
        }
        return Some(match name {
            "nth" => Pseudo::Jquery(Test::TagIndex(index)),
            "eq" => Pseudo::JqueryPosition(Position::Eq(index)),
            "lt" => Pseudo::JqueryPosition(Position::Lt(index)),
            "gt" => Pseudo::JqueryPosition(Position::Gt(index)),
            _ => return None,
        });
    }
    let test = match name {
        "even" => return Some(Pseudo::JqueryPosition(Position::Even)),
        "odd" => return Some(Pseudo::JqueryPosition(Position::Odd)),
        "first" => Test::TagIndex(0),
        "last" => Test::TagLast,
        "checkbox" => Test::InputType("checkbox"),
        "file" => Test::InputType("file"),
        "image" => Test::InputType("image"),
        "password" => Test::InputType("password"),
        "radio" => Test::InputType("radio"),
        "reset" => Test::InputType("reset"),
        "submit" => Test::InputType("submit"),
        "text" => Test::InputType("text"),
        "button" => Test::Button,
        "input" => Test::Input,
        "header" => Test::Header,
        "hidden" => Test::Visible(false),
        "visible" => Test::Visible(true),
        "parent" => Test::Parent,
        _ => return None,
    };
    Some(Pseudo::Jquery(test))
}

impl Test {
    pub(super) fn matches(self, tree: &Tree, node: Handle) -> bool {
        let name = tree.qualified_name(node).unwrap_or_default();
        match self {
            Self::InputType(expected) => html_control_type(tree, node)
                .is_some_and(|kind| kind.eq_ignore_ascii_case(expected)),
            Self::Button => {
                name.eq_ignore_ascii_case("button")
                    || (name.eq_ignore_ascii_case("input")
                        && html_control_type(tree, node)
                            .is_some_and(|kind| kind.eq_ignore_ascii_case("button")))
            }
            Self::Input => ["button", "input", "select", "textarea"]
                .iter()
                .any(|tag| name.eq_ignore_ascii_case(tag)),
            Self::Header => {
                matches!(name.as_bytes(), [b'h' | b'H', b'1'..=b'6'])
            }
            Self::Visible(expected) => {
                tree.selector_state(node, SelectorState::HasOffsetDimensions) == expected
            }
            Self::Parent => tree
                .first_child(node)
                .is_some_and(|child| tree.node_type(child) != NodeType::Fragment),
            Self::TagIndex(index) => usize::try_from(index)
                .is_ok_and(|index| tag_at(tree, node, Some(index)) == Some(node)),
            Self::TagLast => tag_at(tree, node, None) == Some(node),
        }
    }
}

fn html_control_type(tree: &Tree, node: Handle) -> Option<&str> {
    if !tree.is_html(node) {
        return None;
    }
    let kind = tree
        .get_attribute_ns_borrowed(node, None, "type")
        .unwrap_or_default();
    let (valid, default): (&[&str], &str) = match tree.local_name(node)? {
        "input" => (
            &[
                "button",
                "checkbox",
                "color",
                "date",
                "datetime-local",
                "email",
                "file",
                "hidden",
                "image",
                "month",
                "number",
                "password",
                "radio",
                "range",
                "reset",
                "search",
                "submit",
                "tel",
                "text",
                "time",
                "url",
                "week",
            ],
            "text",
        ),
        "button" => (&["button", "reset", "submit"], "submit"),
        _ => return None,
    };
    Some(
        if valid.iter().any(|value| kind.eq_ignore_ascii_case(value)) {
            kind
        } else {
            default
        },
    )
}

fn tag_at(tree: &Tree, node: Handle, mut index: Option<usize>) -> Option<Handle> {
    let tag = tree.tag_name(node)?;
    let mut result = None;
    let root = tree.root();
    let mut visit = |candidate| {
        if tree.tag_name(candidate).as_deref() != Some(&tag) {
            return false;
        }
        match &mut index {
            Some(remaining) if *remaining > 0 => {
                *remaining -= 1;
                false
            }
            Some(_) => {
                result = Some(candidate);
                true
            }
            None => {
                result = Some(candidate);
                false
            }
        }
    };
    if tree.node_type(root) == NodeType::Element && visit(root) {
        return result;
    }
    tree.some_descendant(root, &mut visit);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SelectorExtensions;

    #[test]
    fn positional_filters_count_each_branch_after_matching_and_reset_per_query() {
        let mut extensions = SelectorExtensions::default();
        let mut tree = Tree::parse(
            "<main><p id=a class=x></p><p id=b>text</p><p id=c class=x></p><p id=d class=x></p></main>",
        );
        let [a, b, c, d] = ["a", "b", "c", "d"].map(|id| tree.get_element_by_id(id).unwrap());
        assert!(extensions.compile("p:even").is_err());
        assert!(extensions.register_jquery());
        assert!(!extensions.register_jquery());
        let plan = extensions.compile("main > .x:even, p:odd").unwrap();
        assert_eq!(plan.select(&tree, None), [a, b, d]);
        assert_eq!(plan.select(&tree, None), [a, b, d]);
        assert_eq!(plan.select_with(&tree, None, |node| node != b), [a, b]);
        assert!(plan.matches(&tree, c));
        assert!(!plan.matches(&tree, b));

        let second = extensions.compile("p.x:eq(1)").unwrap();
        assert_eq!(second.first(&tree, None), Some(c));
        assert!(!second.matches(&tree, c));
        assert!(second.closest(&tree, c).is_none());
        assert_eq!(
            extensions.compile("p:lt(2)").unwrap().select(&tree, None),
            [a, b]
        );
        assert_eq!(
            extensions.compile("p:gt(1)").unwrap().select(&tree, None),
            [c, d]
        );
        assert_eq!(
            extensions.compile("p:eq(-1)").unwrap().select(&tree, None),
            []
        );
        assert_eq!(
            extensions
                .compile("p:even:odd")
                .unwrap()
                .select(&tree, None),
            [a, b, c, d]
        );
        assert_eq!(
            extensions
                .compile("p:odd:even")
                .unwrap()
                .select(&tree, None),
            [b, c, d]
        );

        assert_eq!(
            extensions
                .compile("p:even:even")
                .unwrap()
                .select(&tree, None),
            []
        );
        assert_eq!(
            extensions.compile("p:odd:odd").unwrap().select(&tree, None),
            []
        );
        assert_eq!(
            extensions
                .compile("p:eq(1):lt(3)")
                .unwrap()
                .select(&tree, None),
            [b]
        );
        assert_eq!(
            extensions
                .compile("p:lt(3):eq(1)")
                .unwrap()
                .select(&tree, None),
            [a]
        );
        assert_eq!(
            extensions.compile("p:eq(1).x").unwrap().select(&tree, None),
            []
        );
        assert_eq!(
            extensions.compile("p.x:eq(1)").unwrap().select(&tree, None),
            [c]
        );
        assert_eq!(
            extensions
                .compile("p:not(.x):eq(1)")
                .unwrap()
                .select(&tree, None),
            []
        );
        assert_eq!(
            extensions
                .compile("p:eq(1):empty")
                .unwrap()
                .select(&tree, None),
            []
        );
        assert_eq!(
            extensions
                .compile("p:empty:eq(1)")
                .unwrap()
                .select(&tree, None),
            [c]
        );

        let main = tree.query_selector("main").unwrap();
        tree.insert_before(main, d, Some(a));
        assert_eq!(second.first(&tree, Some(main)), Some(a));
        assert_eq!(plan.select(&tree, Some(main)), [d, a, c]);

        for invalid in [
            "p:eq(1.2)",
            "p:lt(9007199254740992)",
            "p:eq",
            "main:even > p",
        ] {
            assert!(extensions.compile(invalid).is_err(), "{invalid}");
        }
        for selector in [
            "p:eq(9007199254740991)",
            "p:lt(-9007199254740991)",
            "p:nth(9007199254740991)",
        ] {
            assert!(extensions.compile(selector).is_ok(), "{selector}");
        }
    }

    #[test]
    fn document_tag_positions_and_live_element_filters_follow_extension_rules() {
        let mut extensions = SelectorExtensions::default();
        extensions.register_jquery();
        let mut tree = Tree::parse(
            "<h2 id=h>Heading</h2><p id=early></p><section><p id=late><!-- comment --></p></section>
            <input id=t type=invalid><input id=c type=CHECKBOX><button id=s></button><div id=v></div>",
        );
        let section = tree.query_selector("section").unwrap();
        let early = tree.get_element_by_id("early").unwrap();
        let late = tree.get_element_by_id("late").unwrap();
        let t = tree.get_element_by_id("t").unwrap();
        let c = tree.get_element_by_id("c").unwrap();
        let s = tree.get_element_by_id("s").unwrap();
        let v = tree.get_element_by_id("v").unwrap();
        let h = tree.get_element_by_id("h").unwrap();
        let first = extensions.compile("p:first").unwrap();
        assert_eq!(first.select(&tree, None), [early]);
        assert_eq!(first.select(&tree, Some(section)), []);
        assert_eq!(
            extensions
                .compile("p:nth(+1):last:parent")
                .unwrap()
                .select(&tree, Some(section)),
            [late]
        );
        assert_eq!(
            extensions
                .compile(":header, :text, :checkbox, :button:submit")
                .unwrap()
                .select(&tree, None),
            [h, t, c, s]
        );
        assert_eq!(
            extensions.compile(":input").unwrap().select(&tree, None),
            [t, c, s]
        );
        assert!(!extensions.compile(":visible").unwrap().matches(&tree, v));
        assert!(extensions.compile(":hidden").unwrap().matches(&tree, v));
        tree.set_selector_state(v, SelectorState::HasOffsetDimensions, true);
        assert_eq!(
            extensions.compile(":visible").unwrap().select(&tree, None),
            [v]
        );
        assert!(!extensions.compile(":hidden").unwrap().matches(&tree, v));
    }

    #[test]
    fn parent_filter_ignores_template_content_fragment_but_counts_text_and_comments() {
        let mut extensions = SelectorExtensions::default();
        extensions.register_jquery();
        let tree = Tree::parse(
            "<template id=template><b>inert</b></template><div id=text>text</div><i id=comment><!-- child --></i><p id=empty></p>",
        );
        let template = tree.get_element_by_id("template").unwrap();
        let text = tree.get_element_by_id("text").unwrap();
        let comment = tree.get_element_by_id("comment").unwrap();
        let empty = tree.get_element_by_id("empty").unwrap();
        let parent = extensions.compile(":parent").unwrap();

        assert!(!parent.matches(&tree, template));
        assert!(parent.matches(&tree, text));
        assert!(parent.matches(&tree, comment));
        assert!(!parent.matches(&tree, empty));
    }
}
