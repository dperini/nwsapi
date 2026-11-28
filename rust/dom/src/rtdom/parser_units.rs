//! An injective, tokenizer-local transport for UTF-16 DOM strings. Only the
//! scalar tokenizer sees escapes: native nodes immediately store original units.
use super::unit_tokenizer::{BufferQueue, Tokenizer, TokenizerOpts, PROCESSING_INSTRUCTION};
use super::{
    core, DoctypeData, DomString, Handle, Namespace, NewNode, NodeType, ProcessingInstructionData,
    Tree,
};
use html5ever::tree_builder::{QuirksMode, TreeBuilder, TreeBuilderOpts};
use html5ever::{LocalName, QualName};
use markup5ever_rcdom::RcDom;
pub(super) const ESCAPE: char = '\u{f0000}';
const UNIT_BASE: u32 = 0xf0800;
pub(super) fn encode(units: &[u16]) -> String {
    let mut source = String::new();
    for value in char::decode_utf16(units.iter().copied()) {
        match value {
            Ok(c) => {
                source.push(c);
                if c == ESCAPE {
                    source.push(c);
                }
            }
            Err(error) => {
                source.push(ESCAPE);
                source.push(
                    char::from_u32(UNIT_BASE + u32::from(error.unpaired_surrogate() - 0xd800))
                        .unwrap(),
                );
            }
        }
    }
    source
}
pub(super) fn decode(source: &str) -> Vec<u16> {
    let mut chars = source.chars();
    let mut units = Vec::new();
    while let Some(c) = chars.next() {
        let c = if c == ESCAPE {
            let escaped = chars.next().expect("well formed internal unit transport");
            if escaped != ESCAPE {
                let offset = u32::from(escaped)
                    .checked_sub(UNIT_BASE)
                    .filter(|&offset| offset < 2048)
                    .expect("internal lone unit escape");
                units.push(0xd800 + offset as u16);
                continue;
            }
            escaped
        } else {
            c
        };
        let mut buffer = [0; 2];
        units.extend_from_slice(c.encode_utf16(&mut buffer));
    }
    units
}
/// Does `units` contain `<?`, the only input Chrome-mode processing instructions change?
fn mentions_processing_instruction(units: &[u16]) -> bool {
    units.windows(2).any(|pair| pair == [0x3c, 0x3f])
}
fn parsed(units: &[u16], processing_instructions: bool) -> RcDom {
    parsed_with_form(
        units,
        None,
        false,
        (false, processing_instructions),
        QuirksMode::NoQuirks,
    )
}
/// A parsed fragment's nodes under a `#document-fragment` root, like
/// `core::parse_html_fragment_with_context` (RCDATA contexts drop U+0000 like Chrome).
fn parsed_fragment(
    units: &[u16],
    context: (QualName, Vec<html5ever::Attribute>),
    has_form_ancestor: bool,
    flags: (bool, bool),
    quirks_mode: QuirksMode,
) -> core::Node {
    if core::is_rcdata_context(&context.0) && units.contains(&0) {
        return core::rcdata_fragment(units.split(|&unit| unit == 0).map(|segment| {
            parsed_fragment(
                segment,
                context.clone(),
                has_form_ancestor,
                flags,
                quirks_mode,
            )
        }));
    }
    let dom = parsed_with_form(units, Some(context), has_form_ancestor, flags, quirks_mode);
    core::fragment_of(core::walk(&dom.document))
}
// The iframe srcdoc document flag: a missing or legacy doctype never selects quirks.
fn parsed_srcdoc(units: &[u16]) -> RcDom {
    let options = TreeBuilderOpts {
        iframe_srcdoc: true,
        ..Default::default()
    };
    parsed_with_options(units, None, false, options, false)
}
/// `flags` = (the tree builder's scripting flag, Chrome-mode processing instructions).
fn parsed_with_form(
    units: &[u16],
    context: Option<(QualName, Vec<html5ever::Attribute>)>,
    has_form_ancestor: bool,
    (scripting_enabled, processing_instructions): (bool, bool),
    quirks_mode: QuirksMode,
) -> RcDom {
    let options = TreeBuilderOpts {
        scripting_enabled,
        quirks_mode,
        ..Default::default()
    };
    parsed_with_options(
        units,
        context,
        has_form_ancestor,
        options,
        processing_instructions,
    )
}
fn parsed_with_options(
    units: &[u16],
    context: Option<(QualName, Vec<html5ever::Attribute>)>,
    has_form_ancestor: bool,
    options: TreeBuilderOpts,
    processing_instructions: bool,
) -> RcDom {
    let sink = RcDom::default();
    let fragment = context.is_some();
    let builder = if let Some((name, attributes)) = context {
        let element = html5ever::tree_builder::create_element(&sink, name, attributes);
        let form = has_form_ancestor.then(|| {
            html5ever::tree_builder::create_element(
                &sink,
                QualName::new(
                    None,
                    html5ever::Namespace::from("http://www.w3.org/1999/xhtml"),
                    LocalName::from("form"),
                ),
                Vec::new(),
            )
        });
        TreeBuilder::new_for_fragment(sink, element, form, options)
    } else {
        TreeBuilder::new(sink, options)
    };
    let initial_state = fragment.then(|| builder.tokenizer_state_for_context_elem(false));
    let tokenizer = Tokenizer::new(
        core::ChromeTokens(builder),
        TokenizerOpts {
            initial_state,
            processing_instructions,
            ..Default::default()
        },
    );
    let queue = BufferQueue::default();
    queue.push_back(encode(units).into());
    // Parser indicators need no host work: this API never executes scripts.
    while !matches!(tokenizer.feed(&queue), html5ever::TokenizerResult::Done) {}
    tokenizer.end();
    let dom = tokenizer.sink.0.sink;
    if core::mentions_selectedcontent(&String::from_utf16_lossy(units)) {
        core::fill_selectedcontent(&dom.document);
    }
    dom
}
impl Tree {
    fn fragment_context(
        &self,
        node: Handle,
        transport: bool,
    ) -> (QualName, Vec<html5ever::Attribute>) {
        let scalar = |units: &[u16]| {
            if transport {
                encode(units)
            } else {
                String::from_utf16_lossy(units)
            }
        };
        let local = self
            .local_name_utf16(node)
            .unwrap_or_else(|| "body".encode_utf16().collect());
        let namespace = self
            .namespace_uri_utf16(node)
            .unwrap_or_else(|| "http://www.w3.org/1999/xhtml".encode_utf16().collect());
        let name = QualName::new(
            None,
            html5ever::Namespace::from(scalar(&namespace)),
            LocalName::from(scalar(&local)),
        );
        let attributes = self
            .attributes_units(node)
            .into_iter()
            .map(|data| html5ever::Attribute {
                name: QualName::new(
                    data.prefix
                        .as_deref()
                        .map(|units| html5ever::Prefix::from(scalar(units))),
                    html5ever::Namespace::from(
                        data.namespace.as_deref().map_or_else(String::new, scalar),
                    ),
                    LocalName::from(scalar(&data.local_name)),
                ),
                value: scalar(&data.value).into(),
            })
            .collect();
        (name, attributes)
    }
    pub(super) fn parse_scalar_fragment(&self, node: Handle, html: &str) -> core::Node {
        let (name, attributes) = self.fragment_context(node, false);
        core::parse_html_fragment_with_context(html, name, attributes)
    }
    /// Parse a detached HTML fragment using the actual context element's name,
    /// namespace, attributes and nearest form ancestor. Existing context children
    /// and pending mutation records are preserved. The returned fragment is an
    /// ordinary collectable component: callers retain its handle until adoption.
    /// `scripting_enabled` selects the HTML tokenizer's `noscript` behavior;
    /// this method never executes scripts or invokes custom-element callbacks.
    #[must_use]
    pub fn create_contextual_fragment_utf16(
        &mut self,
        context: Handle,
        units: &[u16],
        scripting_enabled: bool,
    ) -> Handle {
        let mut ancestor = Some(context);
        let mut has_form_ancestor = false;
        while let Some(node) = ancestor {
            if self.namespace(node) == Namespace::Html && self.local_name(node) == Some("form") {
                has_form_ancestor = true;
                break;
            }
            ancestor = self.parent(node);
        }
        let parsed_root = parsed_fragment(
            units,
            self.fragment_context(context, true),
            has_form_ancestor,
            (scripting_enabled, self.processing_instructions),
            if self.compat_mode == "BackCompat" {
                QuirksMode::Quirks
            } else {
                QuirksMode::NoQuirks
            },
        );
        let fragment = self.create_document_fragment();
        let recording = self.mutation_log.take();
        let children = parsed_root
            .children
            .iter()
            .map(|child| self.import_units_node(child))
            .collect::<Vec<_>>();
        for &child in &children {
            self.parent_ov.insert(child, Some(fragment));
        }
        self.children_ov.insert(fragment, children.into());
        self.mutation_log = recording;
        self.bump_unscoped();
        core::discard_node(parsed_root);
        fragment
    }

    /// Parse a DOM string without repairing its original code units. UTF-8
    /// inputs retain the existing lazy buffer path.
    #[must_use]
    pub fn parse_utf16(units: &[u16]) -> Self {
        if let Some(source) = String::from_utf16(units)
            .ok()
            .filter(|_| !units.contains(&0xfeff))
        {
            return Self::parse(&source);
        }
        let dom = parsed(units, false);
        Self::from_units_dom(&dom)
    }
    /// [`Tree::parse`] in Chrome 156's processing-instruction mode: `<?target data?>`
    /// parses as a processing instruction (see [`Tree::set_processing_instructions`]),
    /// and the returned tree keeps the mode for its own fragment parsing. A page without
    /// `<?` takes the lazy scalar parse unchanged (no UTF-16 copy).
    #[must_use]
    pub fn parse_with_processing_instructions(html: &str) -> Self {
        if !html.contains("<?") {
            let mut tree = Self::parse(html);
            tree.processing_instructions = true;
            return tree;
        }
        Self::parse_utf16_with_processing_instructions(&html.encode_utf16().collect::<Vec<_>>())
    }
    /// [`Tree::parse_with_processing_instructions`] over original DOM-string units.
    #[must_use]
    pub fn parse_utf16_with_processing_instructions(units: &[u16]) -> Self {
        let mut tree = if mentions_processing_instruction(units) {
            Self::from_units_dom(&parsed(units, true))
        } else {
            Self::parse_utf16(units)
        };
        tree.processing_instructions = true;
        tree
    }
    /// Make this tree's fragment parsing (`set_inner_html_utf16`,
    /// `insert_adjacent_html_utf16`, `create_contextual_fragment_utf16`) tokenize
    /// `<?target data?>` like Chrome 156 (miaskiewicz/turbo-dom#135): a processing
    /// instruction when the target is an ASCII letter followed by ASCII alphanumerics,
    /// `-` or `_` and is not `xml` in any case, nothing when the input ends inside one,
    /// and otherwise the bogus comment of the HTML standard. Off by default: the HTML
    /// standard and html5lib-tests, which the conformance gates check, still make every
    /// `<?…>` a bogus comment.
    pub fn set_processing_instructions(&mut self, chrome: bool) {
        self.processing_instructions = chrome;
    }
    /// Whether [`Tree::set_processing_instructions`] is on.
    #[must_use]
    pub fn processing_instructions(&self) -> bool {
        self.processing_instructions
    }
    /// Whether `units` must take the UTF-16 tokenizer for this tree's
    /// processing-instruction mode (the scalar html5ever path has no such mode).
    fn needs_instruction_tokenizer(&self, units: &[u16]) -> bool {
        self.processing_instructions && mentions_processing_instruction(units)
    }
    /// Parse an iframe srcdoc document: identical to [`Tree::parse_utf16`] except
    /// that the document is never in quirks mode.
    #[must_use]
    pub fn parse_srcdoc_utf16(units: &[u16]) -> Self {
        Self::from_units_dom(&parsed_srcdoc(units))
    }
    pub(super) fn from_units_dom(dom: &RcDom) -> Self {
        let node = core::walk(&dom.document);
        let mut tree = Self::parse("");
        tree.compat_mode = if dom.quirks_mode.get() == QuirksMode::Quirks {
            "BackCompat"
        } else {
            "CSS1Compat"
        };
        let root = tree.root();
        let children = node
            .children
            .iter()
            .map(|child| tree.import_units_node(child))
            .collect::<Vec<_>>();
        tree.replace_children(root, &children);
        core::discard_node(node);
        tree
    }
    fn import_units_node(&mut self, node: &core::Node) -> Handle {
        let root = self.import_units_shallow(node);
        let mut pending = vec![(node, root)];
        while let Some((source, target)) = pending.pop() {
            let mut children = super::ChildList::new();
            for child in &source.children {
                let handle = self.import_units_shallow(child);
                self.parent_ov.insert(handle, Some(target));
                children.push(handle);
                pending.push((child, handle));
            }
            if !children.is_empty() {
                self.children_ov.insert(target, children);
            }
        }
        root
    }
    fn import_units_shallow(&mut self, node: &core::Node) -> Handle {
        let target = match NodeType::from_u8(node.node_type) {
            NodeType::Element => {
                let target = self
                    .create_element_ns_units(&decode(&node.name), super::ns_id(&node.namespace));
                for attribute in &node.attrs {
                    let namespace = if self.namespace(target) == Namespace::Html {
                        None
                    } else {
                        super::parsed_attribute_namespace(&attribute.prefix, &attribute.name)
                    };
                    let qualified = if attribute.prefix.is_empty() {
                        attribute.name.clone()
                    } else {
                        format!("{}:{}", attribute.prefix, attribute.name)
                    };
                    self.set_attribute_ns_units(
                        target,
                        namespace
                            .map(|uri| uri.encode_utf16().collect::<Vec<_>>())
                            .as_deref(),
                        &decode(&qualified),
                        &decode(&attribute.value),
                    );
                }
                // fragment parsing reads the `is` value at creation, like the initial parse
                if self.namespace(target) == Namespace::Html
                    && node.attrs.iter().any(|attribute| {
                        attribute.prefix.is_empty() && decode(&attribute.name) == [105, 115]
                    })
                {
                    self.custom_element_states
                        .insert(target, super::CustomElementState::Undefined);
                }
                target
            }
            NodeType::Doctype => self.create_document_type_units(
                &decode(&node.name),
                &decode(&node.public_id),
                &decode(&node.system_id),
            ),
            NodeType::Comment => match node.value.strip_prefix(PROCESSING_INSTRUCTION) {
                Some(instruction) => {
                    let (target, data) = instruction
                        .split_once(' ')
                        .expect("the tokenizer ends a target with a space");
                    self.create_processing_instruction_units(&decode(target), &decode(data))
                }
                None => self.create_comment_utf16(&decode(&node.value)),
            },
            NodeType::Fragment => self.create_document_fragment(),
            _ => self.create_text_node_utf16(&decode(&node.value)),
        };
        target
    }
    pub fn set_inner_html_utf16(&mut self, node: Handle, units: &[u16]) {
        if let Some(source) = String::from_utf16(units)
            .ok()
            .filter(|_| !units.contains(&0xfeff) && !self.needs_instruction_tokenizer(units))
        {
            self.set_inner_html(node, &source);
            return;
        }
        let fragment = parsed_fragment(
            units,
            self.fragment_context(node, true),
            false,
            (false, self.processing_instructions),
            QuirksMode::NoQuirks,
        );
        let children = fragment
            .children
            .iter()
            .map(|child| self.import_units_node(child))
            .collect::<Vec<_>>();
        let removed = if self.is_recording() {
            self.children(node)
        } else {
            Vec::new()
        };
        self.orphan_children(node);
        for &child in &children {
            self.parent_ov.insert(child, Some(node));
        }
        self.children_ov.insert(node, children.clone().into());
        self.bump_node(node);
        self.bump_form_change(node, "");
        if self.is_recording() && (!children.is_empty() || !removed.is_empty()) {
            self.record_child_list_batch(node, children, removed);
        }
        core::discard_node(fragment);
    }
    pub fn insert_adjacent_html_utf16(&mut self, node: Handle, position: &str, units: &[u16]) {
        if let Some(source) = String::from_utf16(units)
            .ok()
            .filter(|_| !units.contains(&0xfeff) && !self.needs_instruction_tokenizer(units))
        {
            self.insert_adjacent_html(node, position, &source);
            return;
        }
        let position = position.to_ascii_lowercase();
        let context = if matches!(position.as_str(), "beforebegin" | "afterend") {
            self.parent(node).unwrap_or(node)
        } else {
            node
        };
        let fragment = parsed_fragment(
            units,
            self.fragment_context(context, true),
            false,
            (false, self.processing_instructions),
            QuirksMode::NoQuirks,
        );
        let children = fragment
            .children
            .iter()
            .map(|child| self.import_units_node(child))
            .collect::<Vec<_>>();
        match position.as_str() {
            "beforebegin" => self.before(node, &children),
            "afterend" => self.after(node, &children),
            "afterbegin" => {
                let first = self.first_child(node);
                for child in children {
                    self.insert_before(node, child, first);
                }
            }
            _ => {
                for child in children {
                    self.append_child(node, child);
                }
            }
        }
        core::discard_node(fragment);
    }
    pub fn create_processing_instruction_units(&mut self, target: &[u16], data: &[u16]) -> Handle {
        let node = self.push_node(NewNode::ProcessingInstruction(Box::new(
            ProcessingInstructionData {
                target: DomString::from_units(target),
                data: DomString::from_units(data),
            },
        )));
        self.bump_unscoped();
        node
    }
    pub fn create_document_type_units(
        &mut self,
        name: &[u16],
        public: &[u16],
        system: &[u16],
    ) -> Handle {
        let node = self.push_node(NewNode::Doctype(Box::new(DoctypeData {
            name: DomString::from_units(name),
            public_id: DomString::from_units(public),
            system_id: DomString::from_units(system),
        })));
        self.bump_unscoped();
        node
    }
    #[must_use]
    /// None for every other node (only created nodes are processing instructions).
    pub fn processing_instruction_target_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if !self.is_new(node) {
            return None;
        }
        match self.new_ref(node) {
            NewNode::ProcessingInstruction(data) => Some(data.target.units()),
            _ => None,
        }
    }
    #[must_use]
    pub fn doctype_name_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if self.node_type(node) != NodeType::Doctype {
            return None;
        }
        if self.is_new(node) {
            if let NewNode::Doctype(data) = self.new_ref(node) {
                return Some(data.name.units());
            }
        }
        self.doctype_name(node)
            .map(|name| name.encode_utf16().collect())
    }
    #[must_use]
    pub fn doctype_public_id_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if self.node_type(node) != NodeType::Doctype {
            return None;
        }
        if self.is_new(node) {
            if let NewNode::Doctype(data) = self.new_ref(node) {
                return Some(data.public_id.units());
            }
        }
        self.doctype_public_id(node)
            .map(|name| name.encode_utf16().collect())
    }
    #[must_use]
    pub fn doctype_system_id_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if self.node_type(node) != NodeType::Doctype {
            return None;
        }
        if self.is_new(node) {
            if let NewNode::Doctype(data) = self.new_ref(node) {
                return Some(data.system_id.units());
            }
        }
        self.doctype_system_id(node)
            .map(|name| name.encode_utf16().collect())
    }
}
