//! Token-time provenance for callers that need original DOM-string positions.
use super::unit_tokenizer::{
    BufferQueue, Token, TokenSink, TokenSinkResult, Tokenizer, TokenizerOpts,
};
use super::{parser_units, Handle, Tree};
use html5ever::tree_builder::{
    ElementFlags, NodeOrText, QuirksMode, TreeBuilder, TreeBuilderOpts, TreeSink,
};
use html5ever::{tendril::StrTendril, Attribute, QualName};
use markup5ever_rcdom::{Handle as RcHandle, NodeData, RcDom, WeakHandle};
use rustc_hash::FxHashMap;
use std::{borrow::Cow, cell::RefCell, rc::Rc};

/// A parser token-boundary position in the original UTF-16 input.
/// Lines and columns are one-based; offsets count original code units. CRLF is
/// one line break while both original units remain included in the offset.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SourcePosition {
    pub utf16_offset: usize,
    pub line: usize,
    pub column: usize,
}
impl Default for SourcePosition {
    fn default() -> Self {
        Self {
            utf16_offset: 0,
            line: 1,
            column: 1,
        }
    }
}
fn advance(position: &mut SourcePosition, prior_cr: &mut bool, units: &[u16]) {
    for &unit in units {
        position.utf16_offset += 1;
        match unit {
            13 => {
                position.line += 1;
                position.column = 1;
                *prior_cr = true;
            }
            10 => {
                if !*prior_cr {
                    position.line += 1;
                }
                position.column = 1;
                *prior_cr = false;
            }
            _ => {
                position.column += 1;
                *prior_cr = false;
            }
        }
    }
}
struct Checkpoint {
    byte: usize,
    position: SourcePosition,
    prior_cr: bool,
}
struct SourceInput {
    encoded: String,
    checkpoints: Vec<Checkpoint>,
}
impl SourceInput {
    fn new(units: &[u16]) -> Self {
        let encoded = parser_units::encode(units);
        let mut checkpoints = vec![Checkpoint {
            byte: 0,
            position: SourcePosition::default(),
            prior_cr: false,
        }];
        let (mut index, mut byte, mut position, mut prior_cr) =
            (0, 0, SourcePosition::default(), false);
        while index < units.len() {
            let (width, bytes) = if (0xd800..=0xdbff).contains(&units[index])
                && units
                    .get(index + 1)
                    .is_some_and(|unit| (0xdc00..=0xdfff).contains(unit))
            {
                let value = 0x10000
                    + (u32::from(units[index] - 0xd800) << 10)
                    + u32::from(units[index + 1] - 0xdc00);
                (
                    2,
                    if value == u32::from(parser_units::ESCAPE) {
                        8
                    } else {
                        4
                    },
                )
            } else if (0xd800..=0xdfff).contains(&units[index]) {
                (1, 8)
            } else {
                (
                    1,
                    char::from_u32(u32::from(units[index])).unwrap().len_utf8(),
                )
            };
            advance(&mut position, &mut prior_cr, &units[index..index + width]);
            index += width;
            byte += bytes;
            if byte - checkpoints.last().unwrap().byte >= 256 {
                checkpoints.push(Checkpoint {
                    byte,
                    position,
                    prior_cr,
                });
            }
        }
        debug_assert_eq!(byte, encoded.len());
        Self {
            encoded,
            checkpoints,
        }
    }
    fn position_at(&self, byte: usize) -> SourcePosition {
        let index = self.checkpoints.partition_point(|row| row.byte <= byte) - 1;
        let checkpoint = &self.checkpoints[index];
        let mut position = checkpoint.position;
        let mut prior_cr = checkpoint.prior_cr;
        // Positions are taken when a start tag is emitted, right after its `>` was
        // consumed, so `byte` is always on an original-unit boundary: never between the
        // two characters of the private unit transport (`parser_units::encode`).
        let prefix = &self.encoded[checkpoint.byte..byte];
        advance(&mut position, &mut prior_cr, &parser_units::decode(prefix));
        position
    }
}
fn attribute_name(name: &QualName) -> Box<[u16]> {
    let mut qualified = name.prefix.as_ref().map_or_else(Vec::new, |prefix| {
        let mut units = parser_units::decode(prefix.as_ref());
        units.push(58);
        units
    });
    qualified.extend(parser_units::decode(name.local.as_ref()));
    qualified.into_boxed_slice()
}
fn map_attr_positions(
    source: &RcHandle,
    target: Handle,
    attribute_positions: &AttributePositions,
    tree: &mut Tree,
) {
    if let NodeData::Element { attrs, .. } = &source.data {
        for attribute in attrs.borrow().iter() {
            let name = attribute_name(&attribute.name);
            if let Some((weak, position)) =
                attribute_positions.get(&(Rc::as_ptr(source) as usize, name.clone()))
            {
                if weak.upgrade().is_some_and(|node| Rc::ptr_eq(&node, source)) {
                    tree.source_attribute_positions
                        .entry(target)
                        .or_default()
                        .insert(name, *position);
                }
            }
        }
    }
}

type AttributePositions = FxHashMap<(usize, Box<[u16]>), (WeakHandle, SourcePosition)>;
struct PositionedDom {
    dom: RcDom,
    lexical_name: RefCell<Option<html5ever::LocalName>>,
    candidates: RefCell<Vec<RcHandle>>,
    added_attributes: RefCell<Vec<(RcHandle, Box<[u16]>)>>,
    attribute_positions: RefCell<AttributePositions>,
    positions: RefCell<FxHashMap<usize, (WeakHandle, SourcePosition)>>,
}
impl TreeSink for PositionedDom {
    type Handle = RcHandle;
    type Output = Self;
    type ElemName<'a> = <RcDom as TreeSink>::ElemName<'a>;
    fn finish(self) -> Self {
        self
    }
    fn parse_error(&self, msg: Cow<'static, str>) {
        self.dom.parse_error(msg);
    }
    fn get_document(&self) -> RcHandle {
        self.dom.get_document()
    }
    fn elem_name<'a>(&'a self, target: &'a RcHandle) -> Self::ElemName<'a> {
        self.dom.elem_name(target)
    }
    fn create_element(
        &self,
        name: QualName,
        attrs: Vec<Attribute>,
        flags: ElementFlags,
    ) -> RcHandle {
        let matches = self
            .lexical_name
            .borrow()
            .as_ref()
            .is_some_and(|token| token.as_ref().eq_ignore_ascii_case(name.local.as_ref()));
        let node = self.dom.create_element(name, attrs, flags);
        if let NodeData::Element { attrs, .. } = &node.data {
            self.added_attributes.borrow_mut().extend(
                attrs
                    .borrow()
                    .iter()
                    .map(|attribute| (node.clone(), attribute_name(&attribute.name))),
            );
        }
        if matches {
            self.candidates.borrow_mut().push(node.clone());
        }
        node
    }
    fn create_comment(&self, text: StrTendril) -> RcHandle {
        self.dom.create_comment(text)
    }
    // html5ever's HTML tree builder never creates processing instructions.
    fn create_pi(&self, _target: StrTendril, _data: StrTendril) -> RcHandle {
        unreachable!("the HTML tree builder never creates processing instructions")
    }
    fn append(&self, parent: &RcHandle, child: NodeOrText<RcHandle>) {
        self.dom.append(parent, child);
    }
    fn append_based_on_parent_node(
        &self,
        element: &RcHandle,
        previous: &RcHandle,
        child: NodeOrText<RcHandle>,
    ) {
        self.dom
            .append_based_on_parent_node(element, previous, child);
    }
    fn append_doctype_to_document(&self, name: StrTendril, public: StrTendril, system: StrTendril) {
        self.dom.append_doctype_to_document(name, public, system);
    }
    fn mark_script_already_started(&self, node: &RcHandle) {
        self.dom.mark_script_already_started(node);
    }
    fn pop(&self, node: &RcHandle) {
        self.dom.pop(node);
    }
    fn get_template_contents(&self, target: &RcHandle) -> RcHandle {
        self.dom.get_template_contents(target)
    }
    fn same_node(&self, a: &RcHandle, b: &RcHandle) -> bool {
        self.dom.same_node(a, b)
    }
    fn set_quirks_mode(&self, mode: QuirksMode) {
        self.dom.set_quirks_mode(mode);
    }
    // html5ever 0.39 never constructs `InsertionPoint::BeforeSibling` (foster parenting
    // goes through `append_based_on_parent_node`).
    fn append_before_sibling(&self, _sibling: &RcHandle, _node: NodeOrText<RcHandle>) {
        unreachable!("html5ever never inserts before a sibling")
    }
    fn add_attrs_if_missing(&self, target: &RcHandle, attrs: Vec<Attribute>) {
        if self.lexical_name.borrow().is_some() {
            if let NodeData::Element { attrs: current, .. } = &target.data {
                let current = current.borrow();
                for attribute in &attrs {
                    if !current.iter().any(|row| row.name == attribute.name) {
                        self.added_attributes
                            .borrow_mut()
                            .push((target.clone(), attribute_name(&attribute.name)));
                    }
                }
            }
        }
        self.dom.add_attrs_if_missing(target, attrs);
    }
    fn associate_with_form(
        &self,
        target: &RcHandle,
        form: &RcHandle,
        nodes: (&RcHandle, Option<&RcHandle>),
    ) {
        self.dom.associate_with_form(target, form, nodes);
    }
    fn remove_from_parent(&self, target: &RcHandle) {
        self.dom.remove_from_parent(target);
    }
    fn reparent_children(&self, node: &RcHandle, parent: &RcHandle) {
        self.dom.reparent_children(node, parent);
    }
    fn is_mathml_annotation_xml_integration_point(&self, node: &RcHandle) -> bool {
        self.dom.is_mathml_annotation_xml_integration_point(node)
    }
    fn set_current_line(&self, line: u64) {
        self.dom.set_current_line(line);
    }
    fn allow_declarative_shadow_roots(&self, parent: &RcHandle) -> bool {
        self.dom.allow_declarative_shadow_roots(parent)
    }
    fn attach_declarative_shadow(
        &self,
        location: &RcHandle,
        template: &RcHandle,
        attrs: &[Attribute],
    ) -> bool {
        self.dom
            .attach_declarative_shadow(location, template, attrs)
    }
    fn maybe_clone_an_option_into_selectedcontent(&self, option: &RcHandle) {
        self.dom.maybe_clone_an_option_into_selectedcontent(option);
    }
}
struct PositionedBuilder {
    builder: TreeBuilder<RcHandle, PositionedDom>,
    queue: Rc<BufferQueue>,
    input: SourceInput,
}
impl TokenSink for PositionedBuilder {
    type Handle = RcHandle;
    fn process_token(&self, token: Token, line: u64) -> TokenSinkResult<RcHandle> {
        let token = crate::core::chrome_doctype(token);
        let name = match &token {
            Token::TagToken(tag) if tag.kind == html5ever::tokenizer::StartTag => {
                Some(tag.name.clone())
            }
            _ => None,
        };
        *self.builder.sink.lexical_name.borrow_mut() = name;
        self.builder.sink.candidates.borrow_mut().clear();
        self.builder.sink.added_attributes.borrow_mut().clear();
        let result = self.builder.process_token(token, line);
        let candidates = std::mem::take(&mut *self.builder.sink.candidates.borrow_mut());
        let attributes = std::mem::take(&mut *self.builder.sink.added_attributes.borrow_mut());
        *self.builder.sink.lexical_name.borrow_mut() = None;
        let position = (!candidates.is_empty() || !attributes.is_empty()).then(|| {
            // Inspect the actual unread buffers at token emission, including
            // tokenizer pushback and optimized chunks; do not search HTML text.
            let unread = self.queue.as_ref().clone();
            let mut remaining = 0;
            while let Some(chunk) = unread.pop_front() {
                remaining += chunk.len();
            }
            self.input.position_at(self.input.encoded.len() - remaining)
        });
        // html5ever reconstructs active formatting before inserting the actual
        // start tag. Record the final matching creation after processing, so
        // reconstructed copies never inherit the current token's provenance.
        if let (Some(position), Some(node)) = (position, candidates.last()) {
            self.builder
                .sink
                .positions
                .borrow_mut()
                .insert(Rc::as_ptr(node) as usize, (Rc::downgrade(node), position));
        }
        if let Some(position) = position {
            for (node, name) in attributes {
                self.builder.sink.attribute_positions.borrow_mut().insert(
                    (Rc::as_ptr(&node) as usize, name),
                    (Rc::downgrade(&node), position),
                );
            }
        }
        result
    }
    fn end(&self) {
        self.builder.end();
    }
    fn adjusted_current_node_present_but_not_in_html_namespace(&self) -> bool {
        self.builder
            .adjusted_current_node_present_but_not_in_html_namespace()
    }
}
impl Tree {
    /// Parse with optional lexical provenance. Synthetic or reconstructed nodes
    /// have no position.
    #[must_use]
    pub fn parse_with_source_positions(html: &str) -> Self {
        Self::parse_utf16_with_source_positions(&html.encode_utf16().collect::<Vec<_>>())
    }
    /// Parse original DOM-string units and retain token-end source positions.
    #[must_use]
    pub fn parse_utf16_with_source_positions(units: &[u16]) -> Self {
        Self::positioned_units(units, false, false)
    }
    /// [`Tree::parse_utf16_with_source_positions`] in Chrome 156's processing-instruction
    /// mode (see [`Tree::set_processing_instructions`]): a loaded page's `<?target data?>`
    /// is a processing instruction, and the tree keeps the mode for its fragment parsing.
    #[must_use]
    pub fn parse_utf16_with_source_positions_and_processing_instructions(units: &[u16]) -> Self {
        let mut tree = Self::positioned_units(units, false, true);
        tree.set_processing_instructions(true);
        tree
    }
    /// [`Tree::parse_utf16_with_source_positions`] for an iframe srcdoc document,
    /// which the HTML parser never puts in quirks mode.
    #[must_use]
    pub fn parse_srcdoc_utf16_with_source_positions(units: &[u16]) -> Self {
        Self::positioned_units(units, true, false)
    }
    fn positioned_units(units: &[u16], iframe_srcdoc: bool, processing_instructions: bool) -> Self {
        let queue = Rc::new(BufferQueue::default());
        let input = SourceInput::new(units);
        queue.push_back(input.encoded.as_str().into());
        let sink = PositionedDom {
            dom: RcDom::default(),
            lexical_name: RefCell::new(None),
            candidates: RefCell::new(Vec::new()),
            added_attributes: RefCell::new(Vec::new()),
            attribute_positions: RefCell::new(FxHashMap::default()),
            positions: RefCell::new(FxHashMap::default()),
        };
        let builder = TreeBuilder::new(
            sink,
            TreeBuilderOpts {
                scripting_enabled: false,
                iframe_srcdoc,
                ..Default::default()
            },
        );
        let sink = PositionedBuilder {
            builder,
            queue: queue.clone(),
            input,
        };
        let tokenizer = Tokenizer::new(
            sink,
            TokenizerOpts {
                processing_instructions,
                ..TokenizerOpts::default()
            },
        );
        while !matches!(tokenizer.feed(&queue), html5ever::TokenizerResult::Done) {}
        tokenizer.end();
        let dom = tokenizer.sink.builder.sink.finish();
        if crate::core::mentions_selectedcontent(&String::from_utf16_lossy(units)) {
            crate::core::fill_selectedcontent(&dom.dom.document);
        }
        let mut tree = Self::from_units_dom(&dom.dom);
        let positions = dom.positions.into_inner();
        let attribute_positions = dom.attribute_positions.into_inner();
        let mut pending = vec![(dom.dom.document.clone(), tree.root())];
        while let Some((source, target)) = pending.pop() {
            if let Some((weak, position)) = positions.get(&(Rc::as_ptr(&source) as usize)) {
                if weak
                    .upgrade()
                    .is_some_and(|node| Rc::ptr_eq(&node, &source))
                {
                    tree.source_positions.insert(target, *position);
                }
            }
            map_attr_positions(&source, target, &attribute_positions, &mut tree);
            let mut children = source.children.borrow().clone();
            if let NodeData::Element {
                template_contents, ..
            } = &source.data
            {
                children.extend(template_contents.borrow().clone());
            }
            let targets = tree.children(target);
            assert_eq!(
                children.len(),
                targets.len(),
                "source-position tree projection"
            );
            pending.extend(children.into_iter().zip(targets));
        }
        tree
    }
    /// Return original parser provenance. Mutations do not invent new positions.
    #[must_use]
    pub fn source_attribute_position(&self, node: Handle, name: &str) -> Option<SourcePosition> {
        self.source_attribute_position_utf16(node, &name.encode_utf16().collect::<Vec<_>>())
    }
    /// Return the parser context in which this attribute was first installed.
    /// Later html/body tags and formatting reconstruction have their own
    /// installation positions, distinct from a node's lexical provenance.
    #[must_use]
    pub fn source_attribute_position_utf16(
        &self,
        node: Handle,
        name: &[u16],
    ) -> Option<SourcePosition> {
        self.source_attribute_positions
            .get(&node)?
            .get(name)
            .copied()
    }
    /// Return the token that originally created this actual node.
    #[must_use]
    pub fn source_position(&self, node: Handle) -> Option<SourcePosition> {
        self.source_positions.get(&node).copied()
    }
}
