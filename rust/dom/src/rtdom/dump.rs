//! html5lib tree-construction DUMP serializer over the rtdom `Tree` (distinct from
//! `serialize.rs`, which emits HTML). Mirrors `harness/serialize.mjs` exactly so
//! rtdom's traversal output can be string-compared against the fixtures' `#document`
//! — a DIRECT rtdom conformance gate (vs the transitive parser gate). Test-only.
//!
//! Format: `line = "| " + "  "*depth + repr`; element `<tag>` (foreign `<svg svg>`),
//! attrs on own lines depth+1 sorted by display name, text `"v"`, comment `<!-- v -->`,
//! doctype `<!DOCTYPE name>` or `<!DOCTYPE name "pub" "sys">`, template `content`.

use super::tree::{Handle, NodeType, Tree};
use std::fmt::Write;

const NS_LABEL: [&str; 4] = ["", "svg ", "math ", ""];

fn indent(depth: usize, out: &mut String) {
    out.push_str("| ");
    for _ in 0..depth {
        out.push_str("  ");
    }
}

fn serialize_node(tree: &Tree, h: Handle, depth: usize, out: &mut String) {
    match tree.node_type(h) {
        NodeType::Element => {
            indent(depth, out);
            out.push('<');
            out.push_str(NS_LABEL[tree.namespace(h) as usize]);
            out.push_str(tree.node_label(h).unwrap_or(""));
            out.push_str(">\n");
            // attributes: own lines, depth+1, sorted by display name (prefix local)
            let mut attrs: Vec<(String, String)> = Vec::new();
            tree.for_each_attr_full(h, |prefix, name, value| {
                let disp = if prefix.is_empty() {
                    name.to_string()
                } else {
                    format!("{prefix} {name}")
                };
                attrs.push((disp, value.to_string()));
            });
            attrs.sort_by(|a, b| a.0.cmp(&b.0));
            for (disp, value) in &attrs {
                indent(depth + 1, out);
                out.push_str(disp);
                out.push_str("=\"");
                out.push_str(value);
                out.push_str("\"\n");
            }
            for c in tree.children(h) {
                serialize_node(tree, c, depth + 1, out);
            }
        }
        NodeType::Text | NodeType::CDataSection => {
            indent(depth, out);
            out.push('"');
            out.push_str(&tree.node_value(h).unwrap_or_default());
            out.push_str("\"\n");
        }
        NodeType::Comment => {
            indent(depth, out);
            out.push_str("<!-- ");
            out.push_str(&tree.node_value(h).unwrap_or_default());
            out.push_str(" -->\n");
        }
        NodeType::Doctype => {
            indent(depth, out);
            let name = tree.doctype_name(h).unwrap_or("");
            let pub_id = tree.doctype_public_id(h).unwrap_or("");
            let sys_id = tree.doctype_system_id(h).unwrap_or("");
            if pub_id.is_empty() && sys_id.is_empty() {
                let _ = writeln!(out, "<!DOCTYPE {name}>");
            } else {
                let _ = writeln!(out, "<!DOCTYPE {name} \"{pub_id}\" \"{sys_id}\">");
            }
        }
        NodeType::Fragment => {
            // <template> synthetic content fragment → prints the literal "content"
            indent(depth, out);
            out.push_str(tree.node_label(h).unwrap_or("content"));
            out.push('\n');
            for c in tree.children(h) {
                serialize_node(tree, c, depth + 1, out);
            }
        }
        _ => {}
    }
}

/// Dump the document's children in html5lib format (root itself not printed).
/// No trailing newline (matches the fixtures' `#document`).
pub fn dump_tree(tree: &Tree) -> String {
    dump_children(tree, tree.root())
}

/// Dump `parent`'s children (a document, fragment or fragment-parsing context
/// element) in html5lib format, `parent` itself not printed. No trailing newline.
pub fn dump_children(tree: &Tree, parent: Handle) -> String {
    let mut out = String::new();
    for c in tree.children(parent) {
        serialize_node(tree, c, 0, &mut out);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dumps_elements_attrs_sorted_text_comment() {
        let tree = Tree::parse("<div id=a class=b><span>hi</span><!--c--></div>");
        let dump = dump_tree(&tree);
        // html/head/body scaffold + the div; attrs sorted (class before id)
        assert!(dump.contains("|     <div>\n|       class=\"b\"\n|       id=\"a\"\n"));
        assert!(dump.contains("|       <span>\n|         \"hi\"\n"));
        assert!(dump.contains("|       <!-- c -->"));
    }

    #[test]
    fn dumps_doctype_with_and_without_ids() {
        let plain = Tree::parse("<!DOCTYPE html><html></html>");
        assert!(dump_tree(&plain).starts_with("| <!DOCTYPE html>"));
        let with_ids = Tree::parse(
            "<!DOCTYPE html PUBLIC \"-//W3C//DTD HTML 4.01//EN\" \"http://www.w3.org/TR/html4/strict.dtd\"><html></html>",
        );
        assert!(dump_tree(&with_ids).starts_with(
            "| <!DOCTYPE html \"-//W3C//DTD HTML 4.01//EN\" \"http://www.w3.org/TR/html4/strict.dtd\">"
        ));
    }

    #[test]
    fn dumps_foreign_ns_and_prefixed_attr() {
        let tree = Tree::parse("<svg><a xlink:href=\"x\"></a></svg>");
        let dump = dump_tree(&tree);
        assert!(dump.contains("<svg svg>"));
        assert!(dump.contains("<svg a>"));
        assert!(dump.contains("xlink href=\"x\""));
    }

    #[test]
    fn dumps_template_content_fragment() {
        let tree = Tree::parse("<template><div></div></template>");
        let dump = dump_tree(&tree);
        // depth = leading "  " count after the "| " line prefix
        let depth = |needle: &str| -> usize {
            let line = dump
                .lines()
                .find(|l| l.trim_end().ends_with(needle))
                .expect(needle);
            let body = line.strip_prefix("| ").unwrap_or(line);
            (body.len() - body.trim_start().len()) / 2
        };
        assert!(dump.contains("<template>"));
        // the template's contents live under a synthetic `content` fragment, <div> deeper
        assert!(depth("<div>") > depth("content"));
    }
}
