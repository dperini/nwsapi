//! Shared parser core. No binding deps — html5ever in, plain nested tree out.
//! Both front-ends (napi-rs native, wasm-bindgen fallback) wrap this unchanged.
//!
//! Plan note: this is the "full marshaling" version — a *complete* tree.
//! The `SoA` flat-buffer (architecture Layer 1) is a later optimization, gated on
//! marshaling proving to be the actual cost. Do not SoA-ify here yet.

use html5ever::driver::ParseOpts;
use html5ever::tendril::StrTendril;
use html5ever::tendril::TendrilSink;
use html5ever::tokenizer::{BufferQueue, Token, TokenSink, TokenSinkResult, Tokenizer};
use html5ever::tree_builder::TreeBuilder;
use html5ever::tree_builder::TreeBuilderOpts;
use html5ever::TokenizerResult;
use html5ever::{ns, parse_fragment, LocalName, QualName};
use markup5ever_rcdom::{Handle, NodeData, RcDom};

/// DOM nodeType constants (subset html5ever can emit).
pub const ELEMENT_NODE: u8 = 1;
pub const TEXT_NODE: u8 = 3;
pub const PROCESSING_INSTRUCTION_NODE: u8 = 7;
pub const COMMENT_NODE: u8 = 8;
pub const DOCUMENT_NODE: u8 = 9;
pub const DOCUMENT_TYPE_NODE: u8 = 10;
pub const DOCUMENT_FRAGMENT_NODE: u8 = 11;

#[cfg_attr(
    feature = "wasm-bind",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
#[derive(Debug, Clone)]
pub struct Attr {
    pub name: String,
    pub value: String,
    /// Namespace prefix for foreign-content attrs ("xlink", "xml", "xmlns"); empty otherwise.
    pub prefix: String,
}

/// One marshaled DOM node. Nested children = complete tree, no lazy indices.
#[cfg_attr(
    feature = "wasm-bind",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
#[derive(Debug, Clone)]
pub struct Node {
    /// DOM nodeType.
    pub node_type: u8,
    /// Tag name (element) lowercased, or "#text"/"#comment"/"#document"/doctype name.
    pub name: String,
    /// Text/comment/PI data; empty for elements.
    pub value: String,
    /// Element namespace, html5lib-style short form: "" (html), "svg", "math". Empty for non-elements.
    pub namespace: String,
    /// Doctype PUBLIC id; empty otherwise.
    pub public_id: String,
    /// Doctype SYSTEM id; empty otherwise.
    pub system_id: String,
    pub attrs: Vec<Attr>,
    pub children: Vec<Node>,
}

/// Parse options matching html5lib-tests defaults (scripting flag off, so
/// `<noscript>` content is parsed as markup rather than rawtext).
fn opts() -> ParseOpts {
    opts_with_scripting(false)
}

/// html5ever's default options with an explicit scripting flag. With scripting
/// on (html5ever's own default) `<noscript>` content is raw text, as in a
/// browser with JavaScript enabled.
fn opts_with_scripting(scripting_enabled: bool) -> ParseOpts {
    ParseOpts {
        tree_builder: TreeBuilderOpts {
            scripting_enabled,
            ..Default::default()
        },
        ..Default::default()
    }
}

/// Chrome 156 treats an empty DOCTYPE system identifier as missing when it picks the
/// document's quirks mode (miaskiewicz/turbo-dom#103): `<!DOCTYPE html PUBLIC "-//W3C//DTD
/// HTML 4.01 Transitional//EN" "">` is quirks (a `<table>` stays in an open `<p>`), where the
/// HTML spec (and html5ever) reads a present identifier. `doctype.systemId` is `""` both ways.
#[must_use]
pub fn chrome_doctype(token: Token) -> Token {
    match token {
        Token::DoctypeToken(mut doctype) if doctype.system_id.as_deref() == Some("") => {
            doctype.system_id = None;
            Token::DoctypeToken(doctype)
        }
        token => token,
    }
}

/// A token sink that applies [`chrome_doctype`] before the wrapped sink (html5ever's tree
/// builder) sees a token.
pub struct ChromeTokens<S>(pub S);

impl<S: TokenSink> TokenSink for ChromeTokens<S> {
    type Handle = S::Handle;
    fn process_token(&self, token: Token, line_number: u64) -> TokenSinkResult<S::Handle> {
        self.0.process_token(chrome_doctype(token), line_number)
    }
    fn end(&self) {
        self.0.end();
    }
    fn adjusted_current_node_present_but_not_in_html_namespace(&self) -> bool {
        self.0
            .adjusted_current_node_present_but_not_in_html_namespace()
    }
}

/// `html5ever::parse_document` over a whole string, with [`ChromeTokens`].
fn parse_document_dom(html: &str, opts: ParseOpts) -> RcDom {
    let builder = TreeBuilder::new(RcDom::default(), opts.tree_builder);
    let tokenizer = Tokenizer::new(ChromeTokens(builder), opts.tokenizer);
    let input = BufferQueue::default();
    input.push_back(StrTendril::from_slice(html));
    while !matches!(tokenizer.feed(&input), TokenizerResult::Done) {}
    tokenizer.end();
    let dom = tokenizer.sink.0.sink;
    if mentions_selectedcontent(html) {
        fill_selectedcontent(&dom.document);
    }
    dom
}

/// Does `html` mention `<selectedcontent>` (ASCII case-insensitive)? Gates [`fill_selectedcontent`].
#[must_use]
pub fn mentions_selectedcontent(html: &str) -> bool {
    html.as_bytes()
        .windows(15)
        .any(|w| w.eq_ignore_ascii_case(b"selectedcontent"))
}

/// Chrome 156 fills every `<selectedcontent>` of a non-`multiple` `<select>` with a clone of
/// the selected option's content while it parses (the "maybe clone an option into
/// selectedcontent" step; miaskiewicz/turbo-dom#104): the last option with `selected`, else
/// the first option that is not disabled (itself or through its `<optgroup>`); with none,
/// the element keeps its content. `markup5ever_rcdom` 0.39's step never finds the element (its
/// descendant search compares the select's own name) and html5ever only runs it on an
/// explicit `</option>`, so the parsed tree is completed here — the final state Chrome's
/// per-option runs leave.
pub fn fill_selectedcontent(root: &Handle) {
    let mut pending = vec![root.clone()];
    while let Some(node) = pending.pop() {
        if html_element(&node, "select") && !has_attribute(&node, "multiple") {
            let (options, contents) = select_parts(&node);
            let selected = options
                .iter()
                .rev()
                .find(|(option, _)| has_attribute(option, "selected"))
                .or_else(|| options.iter().find(|(_, disabled)| !disabled));
            if let Some((option, _)) = selected {
                for content in &contents {
                    for old in content.children.take() {
                        old.parent.set(None);
                    }
                    for child in option.children.borrow().iter() {
                        append_handle(content, deep_clone(child));
                    }
                }
            }
        }
        pending.extend(node.children.borrow().iter().cloned());
    }
}

fn html_element(node: &Handle, local: &str) -> bool {
    matches!(&node.data, NodeData::Element { name, .. } if name.ns == ns!(html) && &*name.local == local)
}

fn has_attribute(node: &Handle, local: &str) -> bool {
    matches!(&node.data, NodeData::Element { attrs, .. }
        if attrs.borrow().iter().any(|a| a.name.ns == ns!() && &*a.name.local == local))
}

/// A select's options (with whether each is disabled) and selectedcontent elements, in tree
/// order: an option counts unless an option, datalist or hr, or a second optgroup, lies
/// between it and the select; a selectedcontent inside an option is not the select's
/// (Chrome 156 leaves it as parsed).
fn select_parts(select: &Handle) -> (Vec<(Handle, bool)>, Vec<Handle>) {
    let (mut options, mut contents) = (Vec::new(), Vec::new());
    // (node, blocked, inside an option, inside an optgroup, inside a disabled optgroup)
    let mut pending: Vec<(Handle, bool, bool, bool, bool)> = select
        .children
        .borrow()
        .iter()
        .rev()
        .map(|child| (child.clone(), false, false, false, false))
        .collect();
    while let Some((node, mut blocked, mut in_option, mut grouped, mut group_disabled)) =
        pending.pop()
    {
        if html_element(&node, "selectedcontent") && !in_option {
            contents.push(node);
            continue;
        }
        classify_select_child(
            &node,
            &mut blocked,
            &mut in_option,
            &mut grouped,
            &mut group_disabled,
            &mut options,
        );
        for child in node.children.borrow().iter().rev() {
            pending.push((child.clone(), blocked, in_option, grouped, group_disabled));
        }
    }
    (options, contents)
}

fn classify_select_child(
    node: &Handle,
    blocked: &mut bool,
    in_option: &mut bool,
    grouped: &mut bool,
    group_disabled: &mut bool,
    options: &mut Vec<(Handle, bool)>,
) {
    if html_element(node, "option") {
        if !*blocked {
            options.push((
                node.clone(),
                *group_disabled || has_attribute(node, "disabled"),
            ));
        }
        *blocked = true;
        *in_option = true;
    } else if html_element(node, "datalist") || html_element(node, "hr") {
        *blocked = true;
    } else if html_element(node, "optgroup") {
        *blocked |= *grouped;
        *grouped = true;
        *group_disabled |= has_attribute(node, "disabled");
    }
}

fn append_handle(parent: &Handle, child: Handle) {
    child.parent.set(Some(std::rc::Rc::downgrade(parent)));
    parent.children.borrow_mut().push(child);
}

/// A deep copy of a parsed node (element attributes and template contents included).
fn deep_clone(node: &Handle) -> Handle {
    let data = match &node.data {
        NodeData::Element {
            name,
            attrs,
            template_contents,
            mathml_annotation_xml_integration_point,
        } => NodeData::Element {
            name: name.clone(),
            attrs: std::cell::RefCell::new(attrs.borrow().clone()),
            template_contents: std::cell::RefCell::new(
                template_contents.borrow().as_ref().map(deep_clone),
            ),
            mathml_annotation_xml_integration_point: *mathml_annotation_xml_integration_point,
        },
        NodeData::Text { contents } => NodeData::Text {
            contents: std::cell::RefCell::new(contents.borrow().clone()),
        },
        NodeData::Comment { contents } => NodeData::Comment {
            contents: contents.clone(),
        },
        NodeData::Document | NodeData::Doctype { .. } | NodeData::ProcessingInstruction { .. } => {
            unreachable!("an option holds elements, text and comments only")
        }
    };
    let copy = markup5ever_rcdom::Node::new(data);
    for child in node.children.borrow().iter() {
        append_handle(&copy, deep_clone(child));
    }
    copy
}

/// Parse a full HTML document. Always yields a Document root (nodeType 9).
#[must_use]
pub fn parse_html_document(html: &str) -> Node {
    let dom = parse_document_dom(html, opts());
    walk(&dom.document)
}

// ============================ SoA flat buffer ============================
// Structure-of-Arrays: parser emits compact parallel arrays once, crossed over
// the boundary as cheap typed-array copies. JS reads tree structure straight from
// the arrays and inflates node objects only on access (no eager full-tree alloc).

/// Index-addressed flat tree. Node index IS its id; node 0 is the document.
#[cfg_attr(
    feature = "wasm-bind",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
#[derive(Default)]
pub struct Soa {
    pub node_type: Vec<u8>,    // DOM nodeType
    pub ns: Vec<u8>,           // 0 html, 1 svg, 2 math
    pub tag_id: Vec<u32>,      // index into tag_names (elements); 0 otherwise
    pub parent: Vec<i32>,      // -1 for root
    pub first_child: Vec<i32>, // -1 if none
    pub next_sib: Vec<i32>,    // -1 if none
    pub text_id: Vec<i32>,     // index into strings for text/comment/doctype-name; -1
    pub pub_id: Vec<i32>,      // doctype PUBLIC id index into strings; -1
    pub sys_id: Vec<i32>,      // doctype SYSTEM id index into strings; -1
    pub attr_start: Vec<i32>,  // offset into attr_* tables; -1 if none
    pub attr_count: Vec<u16>,  // attrs for this node
    // flat attr tables — names/prefixes interned (highly repetitive), values pooled
    pub attr_name_id: Vec<u32>,   // index into attr_names
    pub attr_value_id: Vec<u32>,  // index into attr_values (interned, deduped)
    pub attr_prefix_id: Vec<u32>, // index into attr_prefixes
    // string tables (interned, deduped)
    pub tag_names: Vec<String>,
    pub attr_names: Vec<String>,
    pub attr_prefixes: Vec<String>,
    pub attr_values: Vec<String>, // interned attr value dictionary
    pub strings: Vec<String>,     // text/comment/doctype data, pooled
}

struct SoaBuilder {
    soa: Soa,
    tag_map: rustc_hash::FxHashMap<String, u32>,
    attr_name_map: rustc_hash::FxHashMap<String, u32>,
    attr_prefix_map: rustc_hash::FxHashMap<String, u32>,
    attr_value_map: rustc_hash::FxHashMap<String, u32>,
}

impl SoaBuilder {
    fn intern_tag(&mut self, name: &str) -> u32 {
        if let Some(&id) = self.tag_map.get(name) {
            return id;
        }
        let id = self.soa.tag_names.len() as u32;
        self.soa.tag_names.push(name.to_string());
        self.tag_map.insert(name.to_string(), id);
        id
    }
    fn intern_attr_name(&mut self, name: &str) -> u32 {
        if let Some(&id) = self.attr_name_map.get(name) {
            return id;
        }
        let id = self.soa.attr_names.len() as u32;
        self.soa.attr_names.push(name.to_string());
        self.attr_name_map.insert(name.to_string(), id);
        id
    }
    fn intern_attr_prefix(&mut self, prefix: &str) -> u32 {
        if let Some(&id) = self.attr_prefix_map.get(prefix) {
            return id;
        }
        let id = self.soa.attr_prefixes.len() as u32;
        self.soa.attr_prefixes.push(prefix.to_string());
        self.attr_prefix_map.insert(prefix.to_string(), id);
        id
    }
    fn intern_attr_value(&mut self, value: &str) -> u32 {
        if let Some(&id) = self.attr_value_map.get(value) {
            return id;
        }
        let id = self.soa.attr_values.len() as u32;
        self.soa.attr_values.push(value.to_string());
        self.attr_value_map.insert(value.to_string(), id);
        id
    }
    fn push_string(&mut self, s: &str) -> i32 {
        let id = self.soa.strings.len() as i32;
        self.soa.strings.push(s.to_string());
        id
    }

    // Allocate this node + descendants; return its index.
    fn alloc_node(&mut self, handle: &Handle, parent: i32) -> (i32, Option<Handle>) {
        let idx = self.soa.node_type.len();
        // push placeholders; fill scalars below
        self.soa.node_type.push(0);
        self.soa.ns.push(0);
        self.soa.tag_id.push(0);
        self.soa.parent.push(parent);
        self.soa.first_child.push(-1);
        self.soa.next_sib.push(-1);
        self.soa.text_id.push(-1);
        self.soa.pub_id.push(-1);
        self.soa.sys_id.push(-1);
        self.soa.attr_start.push(-1);
        self.soa.attr_count.push(0);

        let mut template_content: Option<Handle> = None;

        match &handle.data {
            NodeData::Document => self.soa.node_type[idx] = DOCUMENT_NODE,
            NodeData::Doctype {
                name,
                public_id,
                system_id,
            } => {
                self.soa.node_type[idx] = DOCUMENT_TYPE_NODE;
                self.soa.text_id[idx] = self.push_string(name);
                self.soa.pub_id[idx] = self.push_string(public_id);
                self.soa.sys_id[idx] = self.push_string(system_id);
            }
            NodeData::Text { contents } => {
                self.soa.node_type[idx] = TEXT_NODE;
                self.soa.text_id[idx] = self.push_string(&contents.borrow());
            }
            NodeData::Comment { contents } => {
                self.soa.node_type[idx] = COMMENT_NODE;
                self.soa.text_id[idx] = self.push_string(contents);
            }
            NodeData::ProcessingInstruction { .. } => {
                unreachable!("html5ever's HTML tree builder never creates processing instructions")
            }
            NodeData::Element {
                name,
                attrs,
                template_contents,
                ..
            } => {
                self.soa.node_type[idx] = ELEMENT_NODE;
                self.soa.ns[idx] = if name.ns == ns!(svg) {
                    1
                } else if name.ns == ns!(mathml) {
                    2
                } else {
                    0
                };
                self.soa.tag_id[idx] = self.intern_tag(&name.local);
                let borrowed = attrs.borrow();
                if !borrowed.is_empty() {
                    self.soa.attr_start[idx] = self.soa.attr_name_id.len() as i32;
                    self.soa.attr_count[idx] = borrowed.len() as u16;
                    for attr in borrowed.iter() {
                        let nid = self.intern_attr_name(&attr.name.local);
                        self.soa.attr_name_id.push(nid);
                        let vid = self.intern_attr_value(&attr.value);
                        self.soa.attr_value_id.push(vid);
                        let pfx = attr
                            .name
                            .prefix
                            .as_ref()
                            .map_or_default(std::string::ToString::to_string);
                        let pid = self.intern_attr_prefix(&pfx);
                        self.soa.attr_prefix_id.push(pid);
                    }
                }
                if &*name.local == "template" {
                    if let Some(c) = &*template_contents.borrow() {
                        template_content = Some(c.clone());
                    }
                }
            }
        }

        (idx as i32, template_content)
    }

    fn alloc(&mut self, root: &Handle, parent: i32) -> i32 {
        let mut pending = vec![(root.clone(), parent, false)];
        let mut last_child = Vec::new();
        let first = self.soa.node_type.len() as i32;
        while let Some((handle, parent, content)) = pending.pop() {
            let (index, template) = self.alloc_node(&handle, parent);
            last_child.push(-1);
            if content {
                self.soa.node_type[index as usize] = DOCUMENT_FRAGMENT_NODE;
                self.soa.tag_id[index as usize] = self.intern_tag("content");
            }
            if parent >= 0 {
                let previous = last_child[parent as usize];
                if previous < 0 {
                    self.soa.first_child[parent as usize] = index;
                } else {
                    self.soa.next_sib[previous as usize] = index;
                }
                last_child[parent as usize] = index;
            }
            if let Some(template) = template {
                pending.push((template, index, true));
            }
            for child in handle.children.borrow().iter().rev() {
                pending.push((child.clone(), index, false));
            }
        }
        first
    }
}

/// Parse a full document into the `SoA` flat buffer.
#[must_use]
pub fn parse_html_soa(html: &str) -> Soa {
    parse_html_soa_with_compat_mode(html).0
}

/// Parse once and retain html5ever's document compatibility mode.
#[must_use]
pub fn parse_html_soa_with_compat_mode(html: &str) -> (Soa, &'static str) {
    parse_html_soa_with_scripting(html, false)
}

/// [`parse_html_soa_with_compat_mode`] with an explicit tree-builder scripting
/// flag (`false` everywhere else in this crate; `true` is html5ever's default and
/// what native layout consumers that render `<noscript>` as raw text use).
#[must_use]
pub fn parse_html_soa_with_scripting(html: &str, scripting: bool) -> (Soa, &'static str) {
    let dom = parse_document_dom(html, opts_with_scripting(scripting));
    let mut b = SoaBuilder {
        soa: Soa::default(),
        // pre-reserve typical intern-table sizes so the build loop doesn't rehash:
        // tag/attr-name sets are small + bounded; values vary more.
        tag_map: rustc_hash::FxHashMap::with_capacity_and_hasher(32, rustc_hash::FxBuildHasher),
        attr_name_map: rustc_hash::FxHashMap::with_capacity_and_hasher(
            64,
            rustc_hash::FxBuildHasher,
        ),
        attr_prefix_map: rustc_hash::FxHashMap::with_capacity_and_hasher(
            8,
            rustc_hash::FxBuildHasher,
        ),
        attr_value_map: rustc_hash::FxHashMap::with_capacity_and_hasher(
            128,
            rustc_hash::FxBuildHasher,
        ),
    };
    b.alloc(&dom.document, -1);
    let mode = if dom.quirks_mode.get() == html5ever::tree_builder::QuirksMode::Quirks {
        "BackCompat"
    } else {
        "CSS1Compat"
    };
    (b.soa, mode)
}

/// Parse a document and return only the node count — no `core::Node` tree, no
/// marshaling. Isolates raw html5ever parse cost from tree-build + boundary cost.
#[must_use]
pub fn parse_html_document_count(html: &str) -> u32 {
    let dom = parse_document_dom(html, opts());
    count(&dom.document)
}

fn count(handle: &Handle) -> u32 {
    1 + handle.children.borrow().iter().map(count).sum::<u32>()
}

/// Parse an HTML fragment (e.g. an `innerHTML=` set) in `<body>` context.
/// Returns a synthetic Document-fragment-ish root whose children are the parsed nodes.
#[must_use]
pub fn parse_html_fragment(html: &str) -> Node {
    parse_html_fragment_in(html, "", "body")
}

/// Parse a fragment given an html5lib-style context string:
/// "" / "body" / "td" (html ns) or "svg path" / "math ms" (foreign ns).
#[must_use]
pub fn parse_html_fragment_context(html: &str, context: &str) -> Node {
    let (ns, local) = match context {
        "" => ("", "body"),
        s => match s.split_once(' ') {
            Some(("svg", local)) => ("svg", local),
            Some(("math", local)) => ("math", local),
            Some((_, local)) => ("", local),
            None => ("", s),
        },
    };
    parse_html_fragment_in(html, ns, local)
}

/// Parse a fragment in an explicit context element.
/// `context_ns`: "" (html), "svg", or "math"; `context_local`: the element local name.
#[must_use]
pub fn parse_html_fragment_in(html: &str, context_ns: &str, context_local: &str) -> Node {
    let ns = match context_ns {
        "svg" => ns!(svg),
        "math" => ns!(mathml),
        _ => ns!(html),
    };
    let ctx = QualName::new(None, ns, LocalName::from(context_local));
    parse_html_fragment_with_context(html, ctx, Vec::new())
}

/// Fragment contexts retain their namespace and integration-point attributes.
#[must_use]
pub fn parse_html_fragment_with_context(
    html: &str,
    context: QualName,
    attributes: Vec<html5ever::Attribute>,
) -> Node {
    if is_rcdata_context(&context) && html.contains('\0') {
        return rcdata_fragment(html.split('\0').map(|segment| {
            parse_html_fragment_with_context(segment, context.clone(), attributes.clone())
        }));
    }
    let mut options = opts();
    options.tokenizer.discard_bom = false;
    let dom = parse_fragment(RcDom::default(), options, context, attributes, false).one(html);
    if mentions_selectedcontent(html) {
        fill_selectedcontent(&dom.document);
    }
    fragment_of(walk(&dom.document))
}

/// An HTML `textarea` / `title` fragment context: the tokenizer starts (and, a fragment
/// having no appropriate end tag, stays) in RCDATA, so the whole input is text.
pub(crate) fn is_rcdata_context(context: &QualName) -> bool {
    context.ns == ns!(html) && matches!(&*context.local, "textarea" | "title")
}

/// Chrome 156 drops a literal U+0000 in an RCDATA-context fragment (Blink replaces it
/// only in the "text" insertion mode, which the fragment case never enters;
/// miaskiewicz/turbo-dom#92), while html5ever's RCDATA state emits U+FFFD. U+0000 can only
/// end a character reference there, so each NUL-free segment is parsed alone and the
/// segments' texts joined: one text node, or none.
pub(crate) fn rcdata_fragment(segments: impl Iterator<Item = Node>) -> Node {
    let mut frag = fragment_of(Node::default_document());
    let value: String = segments
        .flat_map(|segment| segment.children)
        .map(|text| text.value)
        .collect();
    if !value.is_empty() {
        frag.children.push(Node {
            node_type: TEXT_NODE,
            name: "#text".to_string(),
            value,
            ..Node::default_document()
        });
    }
    frag
}

/// The fragment root (`#document-fragment`) of a walked fragment-parse document:
/// `parse_fragment` wraps results under a synthetic `<html>` element; unwrap it.
pub(crate) fn fragment_of(document: Node) -> Node {
    let mut frag = Node {
        name: "#document-fragment".to_string(),
        ..Node::default_document()
    };
    // The document's only child is that <html> root: the fragment case never enters
    // an insertion mode that appends to the Document (initial / before html, after
    // after body, after after frameset).
    for child in document.children {
        debug_assert!(child.node_type == ELEMENT_NODE && child.name == "html");
        frag.children.extend(child.children);
    }
    frag
}

impl Node {
    /// An empty document node (`#document`, no data, no children).
    fn default_document() -> Node {
        Node {
            node_type: DOCUMENT_NODE,
            name: "#document".to_string(),
            value: String::new(),
            namespace: String::new(),
            public_id: String::new(),
            system_id: String::new(),
            attrs: Vec::new(),
            children: Vec::new(),
        }
    }
}

fn shallow_node(handle: &Handle) -> Node {
    let node = handle;
    let mut public_id = String::new();
    let mut system_id = String::new();
    let (node_type, name, value, namespace, attrs) = match &node.data {
        NodeData::Document => (
            DOCUMENT_NODE,
            "#document".to_string(),
            String::new(),
            String::new(),
            Vec::new(),
        ),
        NodeData::Doctype {
            name,
            public_id: pub_id,
            system_id: sys_id,
        } => {
            public_id = pub_id.to_string();
            system_id = sys_id.to_string();
            (
                DOCUMENT_TYPE_NODE,
                name.to_string(),
                String::new(),
                String::new(),
                Vec::new(),
            )
        }
        NodeData::Text { contents } => (
            TEXT_NODE,
            "#text".to_string(),
            contents.borrow().to_string(),
            String::new(),
            Vec::new(),
        ),
        NodeData::Comment { contents } => (
            COMMENT_NODE,
            "#comment".to_string(),
            contents.to_string(),
            String::new(),
            Vec::new(),
        ),
        NodeData::ProcessingInstruction { .. } => {
            unreachable!("html5ever's HTML tree builder never creates processing instructions")
        }
        NodeData::Element { name, attrs, .. } => {
            let a = attrs
                .borrow()
                .iter()
                .map(|attr| Attr {
                    name: attr.name.local.to_string(),
                    value: attr.value.to_string(),
                    prefix: attr
                        .name
                        .prefix
                        .as_ref()
                        .map_or_default(std::string::ToString::to_string),
                })
                .collect();
            // html5lib short namespace form: "" (html), "svg", "math".
            let ns = if name.ns == ns!(svg) {
                "svg".to_string()
            } else if name.ns == ns!(mathml) {
                "math".to_string()
            } else {
                String::new()
            };
            (ELEMENT_NODE, name.local.to_string(), String::new(), ns, a)
        }
    };

    Node {
        node_type,
        name,
        value,
        namespace,
        public_id,
        system_id,
        attrs,
        children: Vec::new(),
    }
}

pub(crate) fn walk(handle: &Handle) -> Node {
    enum Task {
        Enter(Handle, bool),
        Finish(Node, usize),
    }
    let mut tasks = vec![Task::Enter(handle.clone(), false)];
    let mut complete = Vec::new();
    while let Some(task) = tasks.pop() {
        match task {
            Task::Enter(handle, content) => {
                let mut node = shallow_node(&handle);
                if content {
                    node.node_type = DOCUMENT_FRAGMENT_NODE;
                    node.name = "content".into();
                }
                let children = handle.children.borrow();
                let template = match &handle.data {
                    NodeData::Element {
                        template_contents, ..
                    } => template_contents.borrow().clone(),
                    _ => None,
                };
                tasks.push(Task::Finish(
                    node,
                    children.len() + usize::from(template.is_some()),
                ));
                if let Some(template) = template {
                    tasks.push(Task::Enter(template, true));
                }
                for child in children.iter().rev() {
                    tasks.push(Task::Enter(child.clone(), false));
                }
            }
            Task::Finish(mut node, count) => {
                node.children = complete.split_off(complete.len() - count);
                complete.push(node);
            }
        }
    }
    complete.pop().expect("one parsed root")
}

/// Drain nested parser intermediates without recursive destructor calls.
/// This leaves the public marshaled Node representation unchanged.
pub fn discard_node(mut root: Node) {
    let mut pending = std::mem::take(&mut root.children);
    while let Some(mut node) = pending.pop() {
        pending.append(&mut node.children);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn first<'a>(n: &'a Node, pred: &dyn Fn(&Node) -> bool) -> Option<&'a Node> {
        if pred(n) {
            return Some(n);
        }
        for c in &n.children {
            if let Some(h) = first(c, pred) {
                return Some(h);
            }
        }
        None
    }

    #[test]
    fn document_has_html_head_body() {
        let doc = parse_html_document("<div>hi</div>");
        assert_eq!(doc.node_type, DOCUMENT_NODE);
        assert!(first(&doc, &|n| n.node_type == ELEMENT_NODE && n.name == "html").is_some());
        assert!(first(&doc, &|n| n.node_type == ELEMENT_NODE && n.name == "head").is_some());
        assert!(first(&doc, &|n| n.node_type == ELEMENT_NODE && n.name == "body").is_some());
    }

    #[test]
    fn attrs_marshaled_in_order() {
        let doc = parse_html_document("<div id=\"a\" class=\"x\"></div>");
        let div = first(&doc, &|n| n.name == "div").unwrap();
        assert_eq!(div.attrs[0].name, "id");
        assert_eq!(div.attrs[0].value, "a");
        assert_eq!(div.attrs[1].name, "class");
    }

    #[test]
    fn doctype_public_system_captured() {
        let doc = parse_html_document(
            "<!DOCTYPE html PUBLIC \"-//W3C//DTD HTML 4.01//EN\" \"http://x/strict.dtd\"><p>x",
        );
        let dt = first(&doc, &|n| n.node_type == DOCUMENT_TYPE_NODE).unwrap();
        assert_eq!(dt.name, "html");
        assert_eq!(dt.public_id, "-//W3C//DTD HTML 4.01//EN");
        assert_eq!(dt.system_id, "http://x/strict.dtd");
    }

    #[test]
    fn foster_parenting_table() {
        let doc = parse_html_document("<table>oops<tr><td>x</td></tr></table>");
        let body = first(&doc, &|n| n.name == "body").unwrap();
        let fostered = body
            .children
            .iter()
            .any(|c| c.node_type == TEXT_NODE && c.value.contains("oops"));
        assert!(fostered, "stray text must be fostered out of <table>");
    }

    #[test]
    fn svg_namespace_short_form() {
        let doc = parse_html_document("<svg><rect/></svg>");
        let svg = first(&doc, &|n| n.name == "svg").unwrap();
        assert_eq!(svg.namespace, "svg");
    }

    #[test]
    fn template_content_separated() {
        let frag = parse_html_fragment("<template>Hello</template>");
        let tmpl = first(&frag, &|n| n.name == "template").unwrap();
        let content = tmpl
            .children
            .iter()
            .find(|c| c.node_type == DOCUMENT_FRAGMENT_NODE)
            .expect("template has a content fragment");
        assert_eq!(content.name, "content");
        assert_eq!(content.children[0].value, "Hello");
    }

    #[test]
    fn fragment_context_namespace() {
        let frag = parse_html_fragment_context("<rect/>", "svg path");
        // context is svg path, so a bare <rect> parses in the SVG namespace
        let rect = first(&frag, &|n| n.name == "rect");
        assert!(rect.is_some_and(|n| n.namespace == "svg"));
    }
}
