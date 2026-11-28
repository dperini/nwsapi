//! Borrowed read helpers and parse options for native layout consumers
//! (turbo-dom-layout styles and lays out a [`Tree`] directly instead of copying
//! it into its own node type). Everything here is additive: no existing API
//! changes behaviour.
use std::borrow::Cow;

use super::native_attributes::NativeAttribute;
use super::utf16::DomString;
use super::{AttrList, Handle, NodeType, Tree};
use crate::core::{self, Soa};

/// Options for [`Tree::parse_with`].
///
/// The default (`scripting: false`) is exactly [`Tree::parse`]: the html5lib-tests
/// configuration, where `<noscript>` content parses as markup. `scripting: true`
/// is html5ever's own default and a script-enabled browser's behaviour:
/// `<noscript>` content is a single raw-text node.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ParseOptions {
    /// The tree builder's scripting flag.
    pub scripting: bool,
}

impl Tree {
    /// Parse a full HTML document with explicit [`ParseOptions`].
    /// `Tree::parse_with(html, ParseOptions::default())` is [`Tree::parse`].
    #[must_use]
    pub fn parse_with(html: &str, options: ParseOptions) -> Tree {
        let (buf, compat_mode): (Soa, &'static str) =
            core::parse_html_soa_with_scripting(html, options.scripting);
        Self::from_soa(buf, compat_mode)
    }

    /// The character data of a text, comment or processing-instruction node as a
    /// string; `None` for every other node type.
    ///
    /// The value is the lossy scalar view of the node's UTF-16 code units (exactly
    /// `String::from_utf16_lossy` of [`Tree::node_value_utf16`]: an unpaired
    /// surrogate becomes U+FFFD), so it agrees with every other string read of the
    /// node. It is borrowed from the tree whenever the stored text already is that
    /// scalar view, which is always the case for parsed and string-mutated nodes.
    #[must_use]
    pub fn character_data(&self, h: Handle) -> Option<Cow<'_, str>> {
        if !matches!(
            self.node_type(h),
            NodeType::Text
                | NodeType::CDataSection
                | NodeType::Comment
                | NodeType::ProcessingInstruction
        ) {
            return None;
        }
        if let Some(text) = self.text_ov.get(h) {
            return Some(Cow::Borrowed(text.as_str()));
        }
        if self.is_new(h) {
            return Some(Cow::Borrowed(self.new_ref(h).char_data()));
        }
        let id = self.buf.text_id[h.idx()];
        Some(Cow::Borrowed(
            self.buf.strings.get(id as usize).map_or("", String::as_str),
        ))
    }

    /// The value of the first attribute of `h` whose LOCAL name is `local`,
    /// ignoring any namespace prefix (`xlink:href` on an SVG element answers
    /// `"href"`). This is the attribute identity html5ever's `name.local` gives,
    /// unlike [`Tree::get_attribute`], which matches qualified names.
    #[must_use]
    pub fn get_attribute_local(&self, h: Handle, local: &str) -> Option<&str> {
        self.local_attributes(h)
            .find(|(name, _)| *name == local)
            .map(|(_, value)| value)
    }

    /// Every attribute of `h` as `(local name, value)` in attribute order,
    /// borrowed from the tree (no allocation). Non-elements yield nothing.
    #[must_use]
    pub fn local_attributes(&self, h: Handle) -> LocalAttributes<'_> {
        let state = if let Some(overlay) = self.attrs_ov.get(h) {
            match overlay {
                AttrList::Plain(rows) => LocalState::Plain(rows.iter()),
                AttrList::Namespaced(rows) => LocalState::Namespaced(rows.iter()),
            }
        } else if self.is_new(h) || self.buf.attr_start[h.idx()] < 0 {
            LocalState::Buffer(0..0)
        } else {
            let start = self.buf.attr_start[h.idx()] as usize;
            LocalState::Buffer(start..start + self.buf.attr_count[h.idx()] as usize)
        };
        LocalAttributes { tree: self, state }
    }
}

/// Iterator returned by [`Tree::local_attributes`].
pub struct LocalAttributes<'a> {
    tree: &'a Tree,
    state: LocalState<'a>,
}

enum LocalState<'a> {
    Buffer(std::ops::Range<usize>),
    Plain(std::slice::Iter<'a, (DomString, smol_str::SmolStr)>),
    Namespaced(std::slice::Iter<'a, NativeAttribute>),
}

impl<'a> Iterator for LocalAttributes<'a> {
    type Item = (&'a str, &'a str);

    fn next(&mut self) -> Option<Self::Item> {
        let buf = &self.tree.buf;
        match &mut self.state {
            LocalState::Buffer(range) => range.next().map(|index| {
                (
                    buf.attr_names[buf.attr_name_id[index] as usize].as_str(),
                    buf.attr_values[buf.attr_value_id[index] as usize].as_str(),
                )
            }),
            LocalState::Plain(rows) => rows
                .next()
                .map(|(name, value)| (name.as_str(), value.as_str())),
            LocalState::Namespaced(rows) => rows
                .next()
                .map(|record| (record.local.as_str(), record.legacy.value.as_str())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ParseOptions, Tree};
    use crate::rtdom::tree::{Handle, NodeType};

    fn first(tree: &Tree, name: &str) -> Handle {
        tree.handles()
            .find(|&h| tree.local_name(h) == Some(name))
            .expect("element present")
    }

    #[test]
    fn parse_with_default_is_parse_and_scripting_makes_noscript_raw_text() {
        let html = "<body><noscript><p>x</p></noscript></body>";
        let off = Tree::parse_with(html, ParseOptions::default());
        let plain = Tree::parse(html);
        assert_eq!(off.node_count(), plain.node_count());
        assert_eq!(off.compat_mode(), plain.compat_mode());
        let noscript = first(&off, "noscript");
        assert_eq!(off.local_name(off.children(noscript)[0]), Some("p"));
        let on = Tree::parse_with(html, ParseOptions { scripting: true });
        let noscript = first(&on, "noscript");
        let kids = on.children(noscript);
        assert_eq!(kids.len(), 1);
        assert_eq!(on.node_type(kids[0]), NodeType::Text);
        assert_eq!(on.character_data(kids[0]).as_deref(), Some("<p>x</p>"));
    }

    #[test]
    fn character_data_reads_buffer_overlay_created_and_lone_surrogate_text() {
        let mut tree = Tree::parse("<p>a<!--c--></p><?pi d?>");
        let p = first(&tree, "p");
        let kids = tree.children(p);
        assert_eq!(tree.character_data(kids[0]).as_deref(), Some("a"));
        assert_eq!(tree.character_data(kids[1]).as_deref(), Some("c"));
        assert_eq!(tree.character_data(p), None);
        tree.set_node_value(kids[0], "b");
        assert_eq!(tree.character_data(kids[0]).as_deref(), Some("b"));
        let created = tree.create_text_node("new");
        assert_eq!(tree.character_data(created).as_deref(), Some("new"));
        let pi = tree.create_processing_instruction("t", "data");
        assert_eq!(tree.character_data(pi).as_deref(), Some("data"));
        let element = tree.create_element("div");
        assert_eq!(tree.character_data(element), None);
        // A lone surrogate: the scalar view is the lossy UTF-16 conversion.
        let units = [0x61, 0xd800, 0x62];
        let lone = Tree::parse_utf16(&[
            0x3c, 0x70, 0x3e, units[0], units[1], units[2], 0x3c, 0x2f, 0x70, 0x3e,
        ]);
        let p = first(&lone, "p");
        let text = lone.children(p)[0];
        assert_eq!(
            lone.character_data(text).as_deref(),
            Some(String::from_utf16_lossy(&units).as_str())
        );
        assert_eq!(lone.node_value_utf16(text).as_deref(), Some(&units[..]));
    }

    #[test]
    fn local_attributes_ignore_prefixes_and_cover_every_storage() {
        let mut tree = Tree::parse(
            r##"<div id="a" class="b"></div><span></span><svg xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="#t" href="h"></a></svg>"##,
        );
        let div = first(&tree, "div");
        assert_eq!(
            tree.local_attributes(div).collect::<Vec<_>>(),
            [("id", "a"), ("class", "b")]
        );
        let span = first(&tree, "span");
        assert_eq!(tree.local_attributes(span).count(), 0);
        let link = first(&tree, "a");
        assert_eq!(
            tree.local_attributes(link).collect::<Vec<_>>(),
            [("href", "#t"), ("href", "h")]
        );
        assert_eq!(tree.get_attribute_local(link, "href"), Some("#t"));
        assert_eq!(tree.get_attribute(link, "href"), Some("h"));
        assert_eq!(tree.get_attribute_local(link, "missing"), None);
        // Overlay storage: plain rows, then namespaced records.
        tree.set_attribute(div, "title", "t");
        assert_eq!(tree.get_attribute_local(div, "title"), Some("t"));
        tree.set_attribute_ns(div, Some("http://www.w3.org/1999/xlink"), "xlink:role", "r");
        assert_eq!(tree.get_attribute_local(div, "role"), Some("r"));
        assert_eq!(tree.get_attribute_local(div, "id"), Some("a"));
        let created = tree.create_element("p");
        assert_eq!(tree.local_attributes(created).count(), 0);
        let text = tree.create_text_node("x");
        assert_eq!(tree.local_attributes(text).count(), 0);
        assert_eq!(tree.local_attributes(tree.root()).count(), 0);
    }
}
