//! DOM fragment serialization into exact UTF-16 code units.
use super::{is_raw_text, is_void};
use crate::rtdom::tree::{Handle, NodeType, Tree};
fn scalar(out: &mut Vec<u16>, text: &str) {
    out.extend(text.encode_utf16());
}
fn escaped(out: &mut Vec<u16>, units: &[u16], attribute: bool) {
    for &unit in units {
        let entity = match unit {
            38 => Some("&amp;"),
            160 => Some("&nbsp;"),
            34 if attribute => Some("&quot;"),
            60 => Some("&lt;"),
            62 => Some("&gt;"),
            _ => None,
        };
        if let Some(entity) = entity {
            scalar(out, entity);
        } else {
            out.push(unit);
        }
    }
}
enum Task<'a> {
    Node(Handle, Option<&'a str>),
    Close(Vec<u16>),
}

fn serialize_element<'a>(
    tree: &'a Tree,
    handle: Handle,
    out: &mut Vec<u16>,
    pending: &mut Vec<Task<'a>>,
) {
    let tag = tree.qualified_name_utf16(handle).unwrap_or_default();
    scalar(out, "<");
    out.extend_from_slice(&tag);
    for attribute in tree.attributes_units(handle) {
        scalar(out, " ");
        out.extend_from_slice(&attribute.qualified_name);
        scalar(out, "=\"");
        escaped(out, &attribute.value, true);
        scalar(out, "\"");
    }
    scalar(out, ">");
    let html = tree.namespace_uri(handle) == Some("http://www.w3.org/1999/xhtml");
    let local = tree.local_name(handle).unwrap_or("");
    if html && is_void(local) {
        return;
    }
    pending.push(Task::Close(tag));
    let raw_key = if html && tree.prefix(handle).is_none() {
        local
    } else {
        ""
    };
    for child in tree.children(handle).into_iter().rev() {
        pending.push(Task::Node(child, Some(raw_key)));
    }
}

fn node<'a>(tree: &'a Tree, handle: Handle, parent: Option<&'a str>, out: &mut Vec<u16>) {
    let mut pending = vec![Task::Node(handle, parent)];
    while let Some(task) = pending.pop() {
        let (handle, parent) = match task {
            Task::Node(handle, parent) => (handle, parent),
            Task::Close(tag) => {
                scalar(out, "</");
                out.extend(tag);
                scalar(out, ">");
                continue;
            }
        };
        match tree.node_type(handle) {
            NodeType::Element => serialize_element(tree, handle, out, &mut pending),
            NodeType::Text | NodeType::CDataSection => {
                let units = tree.node_value_utf16(handle).unwrap_or_default();
                if parent.is_some_and(is_raw_text) {
                    out.extend(units);
                } else {
                    escaped(out, &units, false);
                }
            }
            NodeType::Comment => {
                scalar(out, "<!--");
                out.extend(tree.node_value_utf16(handle).unwrap_or_default());
                scalar(out, "-->");
            }
            NodeType::ProcessingInstruction => {
                scalar(out, "<?");
                out.extend(
                    tree.processing_instruction_target_utf16(handle)
                        .unwrap_or_default(),
                );
                scalar(out, " ");
                out.extend(tree.node_value_utf16(handle).unwrap_or_default());
                scalar(out, "?>");
            }
            NodeType::Doctype => {
                scalar(out, "<!DOCTYPE ");
                out.extend(
                    tree.doctype_name_utf16(handle)
                        .unwrap_or_else(|| "html".encode_utf16().collect()),
                );
                scalar(out, ">");
            }
            NodeType::Fragment => {
                for child in tree.children(handle).into_iter().rev() {
                    pending.push(Task::Node(child, Some("")));
                }
            }
            _ => {}
        }
    }
}
fn children(tree: &Tree, handle: Handle, parent: &str, out: &mut Vec<u16>) {
    for child in tree.children(handle) {
        node(tree, child, Some(parent), out);
    }
}
/// Serialize DOM children while preserving non-scalar code units in native values.
#[must_use]
pub fn serialize_inner_utf16(tree: &Tree, handle: Handle) -> Vec<u16> {
    let mut out = Vec::new();
    children(
        tree,
        handle,
        tree.local_name(handle).unwrap_or(""),
        &mut out,
    );
    out
}
/// Serialize a DOM subtree without replacing unpaired surrogate code units.
#[must_use]
pub fn serialize_outer_utf16(tree: &Tree, handle: Handle) -> Vec<u16> {
    let mut out = Vec::new();
    let parent = tree
        .parent(handle)
        .and_then(|parent| tree.local_name(parent));
    node(tree, handle, parent, &mut out);
    out
}
