//! Rust-native DOM tree (pure Rust API, no JS boundary) — Phase-0 core of the
//! pivoted runtime (`RUST_PORT_PLAN` §7 verdict: dual-runtime, Rust consumer gets
//! a native API). Mirrors the JS runtime's load-bearing model:
//!   * immutable parse buffer (`core::Soa`) is the read-only source of truth,
//!   * COW overlay: a node only allocates owned state when it is mutated,
//!   * handle (`u32` node index) is stable; identity is the handle itself,
//!   * `version` counter bumped on EVERY mutation = the cache-invalidation key.
//!
//! Reads come straight off the buffer (zero alloc) unless an overlay exists.

use crate::core::{self, Soa};
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use smol_str::SmolStr;
use std::cell::RefCell;

/// A DOM node type. `#[repr(u8)]` with the standard `nodeType` numeric values, so
/// it round-trips the `SoA`'s compact `u8` column by a plain cast — no lookup table.
/// It enumerates exactly the node types the html5ever core can emit; nothing else
/// is representable, so a `match` over a node's type is exhaustive and compiler-checked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum NodeType {
    Element = 1,
    Attribute = 2,
    Text = 3,
    /// An XML document's CDATA section (only XML parsing and `createCDATASection` make one).
    CDataSection = 4,
    ProcessingInstruction = 7,
    Comment = 8,
    Document = 9,
    Doctype = 10,
    Fragment = 11,
}

impl NodeType {
    /// Read a node type back from the `SoA`'s untyped `u8` column (or a parsed
    /// `core::Node`). Total over every value the parser core writes: the HTML parser
    /// never produces attribute or processing-instruction nodes.
    fn from_u8(v: u8) -> NodeType {
        match v {
            1 => NodeType::Element,
            3 => NodeType::Text,
            8 => NodeType::Comment,
            9 => NodeType::Document,
            10 => NodeType::Doctype,
            11 => NodeType::Fragment,
            _ => unreachable!("SoA node_type column only holds DOM node-type values"),
        }
    }
}

/// An element's namespace — the only three an HTML parser produces. The `SoA` stores
/// it as `0`/`1`/`2`; this is the typed view at the API surface (`as u8` to store).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Namespace {
    Html = 0,
    Svg = 1,
    MathMl = 2,
    /// A null or application-defined namespace, created through the namespace-aware DOM API.
    Other = 3,
}

impl Namespace {
    fn from_u8(v: u8) -> Namespace {
        Namespace::from_id(v)
    }

    /// Build a `Namespace` from its NUMBER (0 HTML, 1 SVG, 2 `MathML`; anything else HTML) —
    /// the public inverse of [`Tree::namespace_id`]. FFI consumers that classify a namespace
    /// URI to a small int can pass it straight to [`Tree::create_element_ns`] without
    /// matching the enum themselves. Locked by `tests/consumer_contract.rs`.
    #[inline]
    #[must_use]
    pub const fn from_id(id: u8) -> Namespace {
        match id {
            1 => Namespace::Svg,
            2 => Namespace::MathMl,
            3 => Namespace::Other,
            _ => Namespace::Html,
        }
    }
}

/// A stable node identity within one [`Tree`]. Opaque: internally it indexes the
/// parse buffer or native node arena, but callers treat
/// it as a token — obtain one from the tree, hand it back. Newtyped rather than a
/// bare `u32` so an arbitrary integer, or a handle belonging to a *different* tree,
/// can't be silently passed where a node of *this* tree is expected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Handle(pub(crate) u32);

impl Handle {
    /// As a `usize` index into the parse buffer's columns.
    #[inline]
    fn idx(self) -> usize {
        self.0 as usize
    }
    /// The raw `u32` a `Handle` wraps (buffer offset, or `new_nodes` slot once
    /// `>= buf_len`). PUBLIC and stable: FFI consumers (turbo-test, turbo-surf) store
    /// handles as plain integers across the JS/napi boundary and must round-trip them
    /// through `raw()` / [`Handle::from_raw`]. Locked by `tests/consumer_contract.rs`.
    #[inline]
    #[must_use]
    pub const fn raw(self) -> u32 {
        self.0
    }
    /// Reconstruct a `Handle` from a raw `u32` previously obtained via [`Handle::raw`]
    /// (e.g. a handle marshaled to JS as a number and handed back). The inverse of
    /// `raw()`. No validation — an out-of-range value simply won't resolve to a node,
    /// exactly as a bogus index did under the old `u32`-alias `Handle`.
    #[inline]
    #[must_use]
    pub const fn from_raw(raw: u32) -> Handle {
        Handle(raw)
    }
}

/// A node created at runtime (not read from the parse buffer). Each variant carries
/// exactly the data its node type needs — a text node cannot hold a namespace, an
/// element always has one — so the old `(node_type, name, ns)` triple's invalid
/// combinations (a `Text` with an `ns`, an element with no name) are unrepresentable.
#[derive(Clone)]
enum NewNode {
    Element {
        name: DomString,
        ns: Namespace,
    },
    Attribute {
        data: Box<NativeAttribute>,
        owner: Option<Handle>,
    },
    Text(DomString),
    CData(DomString),
    Comment(DomString),
    ProcessingInstruction(Box<ProcessingInstructionData>),
    Doctype(Box<DoctypeData>),
    Fragment(Option<SmolStr>),
}

// Rare node payloads stay out of the element/text slots in the mutation arena.
#[derive(Clone)]
struct ProcessingInstructionData {
    target: DomString,
    data: DomString,
}
#[derive(Clone)]
struct DoctypeData {
    name: DomString,
    public_id: DomString,
    system_id: DomString,
}

impl NewNode {
    fn node_type(&self) -> NodeType {
        match self {
            NewNode::Element { .. } => NodeType::Element,
            NewNode::Attribute { .. } => NodeType::Attribute,
            NewNode::Text(_) => NodeType::Text,
            NewNode::CData(_) => NodeType::CDataSection,
            NewNode::Comment(_) => NodeType::Comment,
            NewNode::ProcessingInstruction(_) => NodeType::ProcessingInstruction,
            NewNode::Doctype(_) => NodeType::Doctype,
            NewNode::Fragment(_) => NodeType::Fragment,
        }
    }
    fn namespace(&self) -> Namespace {
        match self {
            NewNode::Element { ns, .. } => *ns,
            _ => Namespace::Html,
        }
    }
    /// The element's local name. Callers check the node is an element first (a new
    /// node's [`NodeType`] is its variant).
    fn element_name(&self) -> &str {
        let NewNode::Element { name, .. } = self else {
            unreachable!("element_name of a non-element")
        };
        name
    }
    /// The character data. Callers check the node is a text, comment or processing
    /// instruction node first.
    fn char_data(&self) -> &str {
        match self {
            NewNode::ProcessingInstruction(value) => &value.data,
            NewNode::Text(s) | NewNode::CData(s) | NewNode::Comment(s) => s,
            _ => unreachable!("char_data of a non-character node"),
        }
    }
}

/// Per-node overlay child list. `SmallVec` inlines up to 8 child handles
/// (32 bytes) before spilling to the heap — most elements have few children,
/// so mutation churn no longer heap-allocs a `Vec` per mutated node.
type ChildList = SmallVec<[Handle; 8]>;
/// Per-node overlay attribute list. Inlines up to 2 `(name, value)` pairs
/// (covers the common id/class case) before spilling to the heap.
/// Namespace-preserving attribute data used by the native DOM mutation surface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttributeData {
    pub namespace: Option<SmolStr>,
    pub prefix: Option<SmolStr>,
    pub local_name: SmolStr,
    pub qualified_name: SmolStr,
    pub value: SmolStr,
}
impl AttributeData {
    fn new(namespace: Option<&str>, qualified: &str, value: &str) -> Self {
        let namespace = namespace.filter(|value| !value.is_empty());
        let (prefix, local) = if namespace.is_some() {
            qualified
                .split_once(':')
                .map_or((None, qualified), |(prefix, local)| (Some(prefix), local))
        } else {
            (None, qualified)
        };
        Self {
            namespace: namespace.map(Into::into),
            prefix: prefix.map(Into::into),
            local_name: local.into(),
            qualified_name: qualified.into(),
            value: value.into(),
        }
    }
}
struct ElementNamespace {
    uri: Option<DomString>,
    prefix: Option<DomString>,
    qualified_name: DomString,
}
// Ordinary HTML attributes retain the compact name/value layout. A namespace
// mutation promotes only that element's list to the complete record format.
enum AttrList {
    Plain(SmallVec<[(DomString, SmolStr); 2]>),
    Namespaced(Box<SmallVec<[NativeAttribute; 2]>>),
}
impl AttrList {
    fn new() -> Self {
        Self::Plain(SmallVec::new())
    }
    fn from_native_records(records: Vec<NativeAttribute>) -> Self {
        if records
            .iter()
            .all(|record| record.ns.is_none() && record.prefix.is_none())
        {
            Self::Plain(
                records
                    .into_iter()
                    .map(|record| (record.qualified, record.legacy.value))
                    .collect(),
            )
        } else {
            Self::Namespaced(Box::new(records.into_iter().collect()))
        }
    }
    fn get(&self, name: &str) -> Option<&str> {
        match self {
            Self::Plain(rows) => rows
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.as_str()),
            Self::Namespaced(rows) => rows
                .iter()
                .find(|record| record.qualified == name)
                .map(|record| record.value.as_str()),
        }
    }
    fn for_each(&self, mut callback: impl FnMut(Option<&str>, &str, &str, Option<&str>, &str)) {
        match self {
            Self::Plain(rows) => {
                for (name, value) in rows {
                    callback(None, "", name, Some(name), value);
                }
            }
            Self::Namespaced(rows) => {
                for record in rows.iter() {
                    callback(
                        record.ns.as_deref(),
                        record.prefix.as_deref().unwrap_or(""),
                        &record.local,
                        Some(&record.qualified),
                        &record.value,
                    );
                }
            }
        }
    }
    fn extra_bytes(&self) -> usize {
        match self {
            Self::Plain(rows) => rows.iter().map(|(name, _)| name.extra_bytes()).sum(),
            Self::Namespaced(rows) => rows.iter().map(NativeAttribute::extra_bytes).sum(),
        }
    }
    fn native_records(&self) -> Vec<NativeAttribute> {
        match self {
            Self::Plain(rows) => rows
                .iter()
                .map(|(name, value)| NativeAttribute::plain(name.clone(), value.clone()))
                .collect(),
            Self::Namespaced(rows) => rows.iter().cloned().collect(),
        }
    }
    fn records_mut(&mut self) -> &mut SmallVec<[NativeAttribute; 2]> {
        if let Self::Plain(rows) = self {
            let records = std::mem::take(rows)
                .into_iter()
                .map(|(name, value)| NativeAttribute::plain(name, value))
                .collect();
            *self = Self::Namespaced(Box::new(records));
        }
        match self {
            Self::Namespaced(rows) => rows,
            Self::Plain(_) => unreachable!(),
        }
    }
    fn set(&mut self, name: &str, value: &str) -> NativeAttribute {
        self.set_qualified(DomString::from(name), value)
    }
    fn set_qualified(&mut self, name: DomString, value: &str) -> NativeAttribute {
        match self {
            Self::Plain(rows) => {
                if let Some((_, slot)) = rows.iter_mut().find(|(key, _)| *key == name) {
                    *slot = value.into();
                } else {
                    rows.push((name.clone(), value.into()));
                }
                NativeAttribute::plain(name, value.into())
            }
            Self::Namespaced(rows) => {
                if let Some(record) = rows.iter_mut().find(|record| record.qualified == name) {
                    record.legacy.value = value.into();
                    record.clone()
                } else {
                    let record = NativeAttribute::plain(name, value.into());
                    rows.push(record.clone());
                    record
                }
            }
        }
    }
    fn set_namespace(&mut self, attribute: NativeAttribute) {
        if attribute.ns.is_none() && attribute.prefix.is_none() && matches!(self, Self::Plain(_)) {
            self.set_qualified(attribute.qualified, &attribute.legacy.value);
            return;
        }
        let rows = self.records_mut();
        if let Some(record) = rows
            .iter_mut()
            .find(|record| record.ns == attribute.ns && record.local == attribute.local)
        {
            *record = attribute;
        } else {
            rows.push(attribute);
        }
    }
    fn remove(&mut self, name: &str) -> Option<NativeAttribute> {
        self.remove_qualified(&DomString::from(name))
    }
    fn remove_qualified(&mut self, name: &DomString) -> Option<NativeAttribute> {
        match self {
            Self::Plain(rows) => {
                let index = rows.iter().position(|(key, _)| key == name)?;
                let (name, value) = rows.remove(index);
                Some(NativeAttribute::plain(name, value))
            }
            Self::Namespaced(rows) => {
                let index = rows.iter().position(|record| &record.qualified == name)?;
                Some(rows.remove(index))
            }
        }
    }
    fn remove_ns(&mut self, namespace: Option<&DomString>, local: &DomString) {
        match self {
            Self::Plain(rows) => {
                if namespace.is_none() {
                    rows.retain(|(name, _)| name != local);
                }
            }
            Self::Namespaced(rows) => {
                rows.retain(|record| !(record.ns.as_ref() == namespace && record.local == *local));
            }
        }
    }
}

fn parsed_attribute_namespace(prefix: &str, local: &str) -> Option<&'static str> {
    match prefix {
        "xlink" => Some("http://www.w3.org/1999/xlink"),
        "xml" => Some("http://www.w3.org/XML/1998/namespace"),
        "xmlns" => Some("http://www.w3.org/2000/xmlns/"),
        "" if local == "xmlns" => Some("http://www.w3.org/2000/xmlns/"),
        _ => None,
    }
}

/// A COW mutation overlay keyed by [`Handle`], split by the structural fact that
/// created-node handles are **dense**: `push_node` assigns them `buf_len + i`
/// monotonically (parallel to the `new_nodes` arena), while buffer nodes are the
/// sparse ones that only sometimes get mutated. So:
///   * a **created** node (`idx >= buf_len`) lives in a `Vec<Option<T>>` indexed by
///     `idx - buf_len` — O(1), no hashing, no rehash, and zero memory waste (every
///     created node already exists in `new_nodes`, so the slot is one it "owns").
///   * a **buffer** node (`idx < buf_len`) lives in an `FxHashMap` (only the sparse
///     subset of buffer nodes that are ever mutated allocate an entry).
///
/// The split is encapsulated ENTIRELY inside these methods — call sites never branch
/// on `idx < buf_len`. A created node structurally always resolves to its dense slot;
/// the only way to reach a slot is through this API, so "created node → dense, buffer
/// node → map" can't be gotten wrong at a call site.
struct Overlay<T> {
    /// Indexed by `handle.idx() - buf_len`. Grows with `None` as created handles
    /// appear; an absent (out-of-bounds) or `None` slot = no overlay for that node.
    dense: Vec<Option<T>>,
    /// Overrides for buffer nodes (`idx < buf_len`), the sparsely-mutated subset.
    map: FxHashMap<Handle, T>,
    /// The created-node boundary: handles `< buf_len` are buffer nodes (→ `map`),
    /// `>= buf_len` are created nodes (→ `dense[idx - buf_len]`).
    buf_len: u32,
    sparse: bool,
}

impl<T> Overlay<T> {
    fn new(buf_len: u32) -> Overlay<T> {
        Overlay {
            dense: Vec::new(),
            map: FxHashMap::default(),
            buf_len,
            sparse: false,
        }
    }

    /// `Some(handle.idx() - buf_len)` for a created node, `None` for a buffer node.
    #[inline]
    fn dense_idx(&self, h: Handle) -> Option<usize> {
        if !self.sparse && h.raw() >= self.buf_len {
            Some((h.raw() - self.buf_len) as usize)
        } else {
            None
        }
    }

    #[inline]
    fn get(&self, h: Handle) -> Option<&T> {
        match self.dense_idx(h) {
            Some(i) => self.dense.get(i).and_then(Option::as_ref),
            None => self.map.get(&h),
        }
    }

    #[inline]
    fn get_mut(&mut self, h: Handle) -> Option<&mut T> {
        match self.dense_idx(h) {
            Some(i) => self.dense.get_mut(i).and_then(Option::as_mut),
            None => self.map.get_mut(&h),
        }
    }

    #[inline]
    fn contains(&self, h: Handle) -> bool {
        match self.dense_idx(h) {
            Some(i) => matches!(self.dense.get(i), Some(Some(_))),
            None => self.map.contains_key(&h),
        }
    }

    /// Grow the dense Vec so index `i` is addressable (filling with `None`).
    #[inline]
    fn ensure_dense_slot(&mut self, i: usize) {
        if i >= self.dense.len() {
            self.dense.resize_with(i + 1, || None);
        }
    }

    #[inline]
    fn insert(&mut self, h: Handle, v: T) {
        match self.dense_idx(h) {
            Some(i) => {
                self.ensure_dense_slot(i);
                self.dense[i] = Some(v);
            }
            None => {
                self.map.insert(h, v);
            }
        }
    }
}

enum ArenaHandles {
    Dense(std::iter::Map<std::ops::Range<u32>, fn(u32) -> Handle>),
    Sparse(std::vec::IntoIter<Handle>),
}
impl Iterator for ArenaHandles {
    type Item = Handle;
    fn next(&mut self) -> Option<Handle> {
        match self {
            Self::Dense(handles) => handles.next(),
            Self::Sparse(handles) => handles.next(),
        }
    }
}
enum NodeArena {
    Dense(Vec<NewNode>),
    Sparse(FxHashMap<Handle, NewNode>),
}
impl NodeArena {
    fn len(&self) -> usize {
        match self {
            Self::Dense(nodes) => nodes.len(),
            Self::Sparse(nodes) => nodes.len(),
        }
    }
    fn get(&self, h: Handle, boundary: u32) -> &NewNode {
        match self {
            Self::Dense(nodes) => &nodes[(h.raw() - boundary) as usize],
            Self::Sparse(nodes) => &nodes[&h],
        }
    }
    fn get_mut(&mut self, h: Handle, boundary: u32) -> &mut NewNode {
        match self {
            Self::Dense(nodes) => &mut nodes[(h.raw() - boundary) as usize],
            Self::Sparse(nodes) => nodes.get_mut(&h).expect("collected DOM handle"),
        }
    }
    fn insert(&mut self, h: Handle, node: NewNode) {
        match self {
            Self::Dense(nodes) => nodes.push(node),
            Self::Sparse(nodes) => {
                nodes.insert(h, node);
            }
        }
    }
}

#[path = "parser_positions.rs"]
mod parser_positions;
#[path = "parser_units.rs"]
mod parser_units;
#[cfg(test)]
#[path = "processing_instructions_tests.rs"]
mod processing_instructions_tests;
pub use parser_positions::SourcePosition;
#[allow(clippy::pedantic)]
#[path = "unit_tokenizer/mod.rs"]
mod unit_tokenizer;

#[path = "native_attributes.rs"]
mod native_attributes;
pub use native_attributes::AttributeDataUtf16;
use native_attributes::{NativeAttribute, NativeMutationNames};

#[path = "names_utf16.rs"]
mod names_utf16;

#[path = "utf16.rs"]
mod utf16;
use utf16::DomString;
pub use utf16::Utf16MutationEvent;

#[path = "custom_states.rs"]
mod custom_states;

#[path = "custom_element_state.rs"]
mod custom_element_state;
#[path = "fullscreen_state.rs"]
mod fullscreen_state;
#[path = "selector_state.rs"]
mod selector_state;
#[cfg(test)]
pub(crate) use custom_element_state::is_custom_element_name;
pub use custom_element_state::CustomElementState;
pub use selector_state::SelectorState;

#[path = "storage.rs"]
mod storage;

#[path = "tree_access.rs"]
mod tree_access;
pub use storage::{CollectionBudget, CollectionError, CollectionReport, StorageStats};
pub use tree_access::{LocalAttributes, ParseOptions};

pub struct Tree {
    buf: Soa,
    source_positions: FxHashMap<Handle, SourcePosition>,
    source_attribute_positions: FxHashMap<Handle, FxHashMap<Box<[u16]>, SourcePosition>>,
    compat_mode: &'static str,
    pub(crate) host_document: Option<crate::rtdom::query::HostDocumentKind>,
    /// Chrome-mode processing instructions in fragment parsing (`parser_units.rs`).
    processing_instructions: bool,
    buf_len: u32,
    new_nodes: NodeArena,
    next_handle: u32,
    element_namespaces: FxHashMap<Handle, ElementNamespace>,
    attribute_nodes: FxHashMap<(Handle, Option<DomString>, DomString), Handle>,
    attribute_units: FxHashMap<(Handle, Option<DomString>, DomString), Box<[u16]>>,
    // --- COW overlays (present only for mutated/created nodes) ---
    // Hybrid `Overlay<T>`: created nodes (dense handles) live in a `Vec`, sparse
    // buffer-node overrides in a map — see `Overlay`. `Some(parent)` = re-parented;
    // `None` = detached. No `-1` sentinel — a detached node is `None`, never a handle
    // that happens to read as negative.
    parent_ov: Overlay<Option<Handle>>,
    children_ov: Overlay<ChildList>,
    attrs_ov: Overlay<AttrList>,
    text_ov: Overlay<DomString>,
    /// host → shadow-root handle, and shadow-root → host (the two shadow maps).
    shadow_root_of_host: FxHashMap<Handle, Handle>,
    host_of_shadow_root: FxHashMap<Handle, Handle>,
    pub version: u64,
    /// `version` without the `style` attribute changes: everything a selector or another
    /// element's cascade reads moves it, except an element's inline style, which selectors
    /// see only through attribute selectors naming `style` (embedders check for those).
    pub selector_version: u64,
    /// Subtree-scoped style invalidation (turbo-dom#279): the `selector_version` at which a
    /// mutation last touched each node (its attributes other than `style`, its insertion or
    /// removal, its text, its custom / form / element state). A computed style is stale only
    /// when its element or an ancestor moved (see [`Tree::style_generation`]).
    style_gens: FxHashMap<Handle, u64>,
    /// The `selector_version` at which each node's child list last changed (a child inserted,
    /// removed or mutated): what sibling and child-indexed selectors read. First: any change;
    /// second: the changes a later sibling can see (a child inserted, removed or mutated that
    /// has a next sibling — an append, or a change to the last child, reaches no sibling
    /// through `+`, `~`, `:nth-child`, `:first-child` or `:*-of-type`).
    child_gens: FxHashMap<Handle, (u64, u64)>,
    /// The `selector_version` of the last mutation that can change form validity anywhere
    /// (`:valid` / `:invalid` / `:user-*` of a control, its form, fieldset or radio group).
    form_gen: u64,
    /// The class names, ids and attribute names the owner's selectors reference (turbo-dom#279),
    /// reported by the embedder that keys computed styles on [`Self::style_generation`]: a
    /// write of an unreferenced class token, id or presentational attribute moves no style
    /// generation. `None`: every write does.
    style_filter: Option<StyleFilter>,
    /// The `selector_version` of the last mutation no node scope covers (a stylesheet owner's
    /// attribute, the fullscreen stack, a shadow root): it moves every style generation.
    global_style_gen: u64,
    /// version-keyed query result cache (mirrors JS cachedQSA / Document.__version).
    pub(crate) qcache: RefCell<QueryCache>,
    pub(crate) query_candidates: RefCell<crate::rtdom::query::CandidateCache>,
    /// selector-string → parsed selector-list cache. A `matches()` driven over an
    /// element loop re-parses the SAME selector per element; this memoizes the parse
    /// (shared `Rc` so a hit is a pointer bump). Version-independent — a parsed
    /// selector doesn't change when the tree mutates. Bounded like `qcache`.
    pub(crate) parse_cache: RefCell<crate::rtdom::query::config::PlanCache<String>>,
    pub(crate) match_lambdas: RefCell<crate::rtdom::query::config::PlanCache<String>>,
    pub(crate) select_lambdas: RefCell<crate::rtdom::query::config::PlanCache<String>>,
    pub(crate) match_resolvers: RefCell<crate::rtdom::query::config::PlanCache<String>>,
    pub(crate) select_resolvers: RefCell<crate::rtdom::query::config::PlanCache<String>>,
    pub(crate) units_parse_cache: RefCell<crate::rtdom::query::config::PlanCache<Vec<u16>>>,
    pub(crate) selector_config: crate::SelectorConfig,
    /// version-keyed computed-style cache (mirrors JS `__computedStyle`).
    pub(crate) css_cache: RefCell<crate::rtdom::cascade::CssCache>,
    /// CSSOM rules inserted into a `<style>` element without changing its text child.
    pub(crate) cssom_sheets: FxHashMap<Handle, crate::rtdom::cssom::CssStyleSheet>,
    /// Mutation-record buffer. `None` until an observer calls `start_recording`
    /// (the no-observer hot path stays zero-alloc, mirroring JS notifyMutation gating).
    mutation_log: Option<Vec<crate::rtdom::mutations::MutationEvent>>,
    mutation_old_units: FxHashMap<usize, Box<[u16]>>,
    mutation_name_units: FxHashMap<usize, NativeMutationNames>,
    /// Live IDL boolean form-state properties (checked/selected/disabled/required/
    /// read-only), settable independently of the HTML attribute by native embeddings.
    /// Absent ⇒ fall back to the attribute (see the
    /// form-state pseudo-classes in query.rs). Empty on the parse/no-interaction path.
    form_props: FxHashMap<(Handle, FormProp), bool>,
    custom_states: FxHashMap<Handle, FxHashSet<Box<[u16]>>>,
    /// Embedder-reported (and import-time) custom element states; absent = derived at read
    /// time from the element's creation (`custom_element_state.rs`).
    custom_element_states: FxHashMap<Handle, CustomElementState>,
    /// The embedder-reported fullscreen stack, bottom first (`fullscreen_state.rs`).
    fullscreen_stack: Vec<Handle>,
    selector_states: FxHashSet<(Handle, SelectorState)>,
    host_functional_states: FxHashSet<(Handle, String)>,
    host_slotted_selectors: FxHashMap<Handle, FxHashSet<String>>,
    pub(crate) bulk_has_planner: Option<crate::rtdom::query::BulkHasPlannerCallback>,
    pub(crate) bulk_has_host_policy: Option<nwsapi_has::has_policy::Host>,
}

/// The boolean IDL form-state properties whose selector semantics can diverge from the
/// HTML attribute once a consumer sets the live property (mirrors the JS getters:
/// `checked`/`selected` read a live overlay first, the rest read the attribute but the
/// `:disabled`/`:required`/`:read-only` matchers also honor the live property).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FormProp {
    Checked,
    Selected,
    Disabled,
    Required,
    ReadOnly,
}

/// The selector features a [`Tree`]'s style generations follow (see
/// [`Tree::set_style_filter`]).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StyleFilter {
    /// Class names a selector names (`.name`).
    pub classes: FxHashSet<Box<str>>,
    /// Ids a selector names (`#name`).
    pub ids: FxHashSet<Box<str>>,
    /// Attribute names (ASCII lowercase) an attribute selector names (`[name...]`).
    pub attributes: FxHashSet<Box<str>>,
}

/// What a [`Tree::style_generation`] reads beyond the element and its ancestors.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StyleScope {
    pub siblings: Siblings,
    /// Form validity (`:valid`, `:invalid`, `:user-valid`, `:user-invalid`).
    pub forms: bool,
}

/// Which child-list changes along the chain a [`StyleScope`] reads.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Siblings {
    #[default]
    None,
    /// Changes a later sibling sees (`+`, `~`, `:nth-child`, `:first-child`, `:*-of-type`).
    Forward,
    /// Every change (`:last-child`, `:only-child`, `:nth-last-*`, `:last-of-type`, ...).
    Both,
}

/// Each tree's `version` starts at its own base, 2^28 apart, so a version names one tree's
/// state across every tree of the process: caches keyed on (document, version) outside the
/// tree (the label index, the `XPath` and CSS policy caches) can never mistake a new tree for an older one
/// whose counter happened to reach the same value. The bases cycle through 2^25 slots so
/// every version stays below 2^53 (exact as a JS number).
fn next_version_base() -> u64 {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    (NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % (1 << 25)) << 28
}

type UnitQueryResults = FxHashMap<Vec<u16>, std::rc::Rc<[Handle]>>;

#[derive(Default)]
pub(crate) struct QueryCache {
    pub version: u64,
    /// Shared so a cache hit is a pointer bump, not a Vec copy (repeated qSA is hot).
    pub map: FxHashMap<String, std::rc::Rc<[Handle]>>,
    pub first: FxHashMap<String, Option<Handle>>,
    pub first_units: FxHashMap<Vec<u16>, Option<Handle>>,
    pub units_by_root: FxHashMap<Handle, UnitQueryResults>,
}

impl QueryCache {
    pub(crate) fn sync(&mut self, version: u64) {
        if self.version != version {
            self.version = version;
            self.map.clear();
            self.first.clear();
            self.first_units.clear();
            self.units_by_root.clear();
        }
    }
}

impl Tree {
    #[must_use]
    pub fn parse(html: &str) -> Tree {
        let (buf, compat_mode) = core::parse_html_soa_with_compat_mode(html);
        Self::from_soa(buf, compat_mode)
    }

    /// A fresh tree viewing a parsed `SoA` buffer (no overlays yet).
    fn from_soa(buf: Soa, compat_mode: &'static str) -> Tree {
        let buf_len = buf.node_type.len() as u32;
        Tree {
            buf,
            source_positions: FxHashMap::default(),
            source_attribute_positions: FxHashMap::default(),
            compat_mode,
            host_document: None,
            processing_instructions: false,
            buf_len,
            new_nodes: NodeArena::Dense(Vec::new()),
            next_handle: buf_len,
            element_namespaces: FxHashMap::default(),
            attribute_nodes: FxHashMap::default(),
            attribute_units: FxHashMap::default(),
            parent_ov: Overlay::new(buf_len),
            children_ov: Overlay::new(buf_len),
            attrs_ov: Overlay::new(buf_len),
            text_ov: Overlay::new(buf_len),
            shadow_root_of_host: FxHashMap::default(),
            host_of_shadow_root: FxHashMap::default(),
            version: next_version_base(),
            selector_version: 0,
            style_gens: FxHashMap::default(),
            child_gens: FxHashMap::default(),
            form_gen: 0,
            style_filter: None,
            global_style_gen: 0,
            qcache: RefCell::new(QueryCache::default()),
            query_candidates: RefCell::default(),
            parse_cache: RefCell::default(),
            units_parse_cache: RefCell::default(),
            match_resolvers: RefCell::default(),
            match_lambdas: RefCell::default(),
            select_lambdas: RefCell::default(),
            select_resolvers: RefCell::default(),
            selector_config: crate::SelectorConfig::default(),
            css_cache: RefCell::new(crate::rtdom::cascade::CssCache::default()),
            cssom_sheets: FxHashMap::default(),
            mutation_log: None,
            mutation_old_units: FxHashMap::default(),
            mutation_name_units: FxHashMap::default(),
            form_props: FxHashMap::default(),
            custom_states: FxHashMap::default(),
            custom_element_states: FxHashMap::default(),
            fullscreen_stack: Vec::new(),
            selector_states: FxHashSet::default(),
            host_functional_states: FxHashSet::default(),
            host_slotted_selectors: FxHashMap::default(),
            bulk_has_planner: None,
            bulk_has_host_policy: None,
        }
    }

    #[inline]
    fn is_new(&self, h: Handle) -> bool {
        h.raw() >= self.buf_len
    }
    #[inline]
    fn new_ref(&self, h: Handle) -> &NewNode {
        self.new_nodes.get(h, self.buf_len)
    }

    /// Count live nodes; this is not the handle allocation high-water mark.
    pub fn node_count(&self) -> u32 {
        self.buf_len + self.new_nodes.len() as u32
    }

    /// The document root (node 0 in the `SoA`).
    pub fn root(&self) -> Handle {
        Handle(0)
    }

    /// Iterate all live handles in increasing identity order. Collection creates
    /// gaps, so a raw `0..node_count()` scan is not valid after collection.
    pub fn handles(&self) -> impl Iterator<Item = Handle> {
        let extra = match &self.new_nodes {
            NodeArena::Dense(nodes) => {
                ArenaHandles::Dense((self.buf_len..self.buf_len + nodes.len() as u32).map(Handle))
            }
            NodeArena::Sparse(nodes) => {
                let mut handles: Vec<_> = nodes.keys().copied().collect();
                handles.sort_unstable();
                ArenaHandles::Sparse(handles.into_iter())
            }
        };
        (0..self.buf_len).map(Handle).chain(extra)
    }

    // ----------------------------------------------------------------- reads
    pub fn node_type(&self, h: Handle) -> NodeType {
        if self.is_new(h) {
            self.new_ref(h).node_type()
        } else {
            NodeType::from_u8(self.buf.node_type[h.idx()])
        }
    }

    pub fn namespace(&self, h: Handle) -> Namespace {
        if self.is_new(h) {
            self.new_ref(h).namespace()
        } else {
            Namespace::from_u8(self.buf.ns[h.idx()])
        }
    }

    /// The DOM `nodeType` NUMBER for `h` (element = 1, text = 3, PI = 7, comment = 8,
    /// document = 9, doctype = 10, fragment = 11). PUBLIC, stable FFI accessor: consumers
    /// marshal `nodeType` to JS as a number, so they need the integer, not the
    /// [`NodeType`] enum (which stays the internal, type-safe representation). Locked by
    /// `tests/consumer_contract.rs`.
    #[inline]
    #[must_use]
    pub fn node_type_id(&self, h: Handle) -> u8 {
        self.node_type(h) as u8
    }

    /// The document mode established by the HTML parser, unaffected by later doctype mutations.
    #[must_use]
    pub fn compat_mode(&self) -> &'static str {
        self.compat_mode
    }

    /// The namespace as a NUMBER (HTML = 0, SVG = 1, `MathML` = 2). PUBLIC, stable FFI
    /// accessor mirroring [`Tree::node_type_id`]: consumers branch on `namespace_id(h)
    /// == 0` (is-HTML) at the JS/napi boundary. Locked by `tests/consumer_contract.rs`.
    #[inline]
    #[must_use]
    pub fn namespace_id(&self, h: Handle) -> u8 {
        self.namespace(h) as u8
    }

    /// localName (lowercase as parsed). None for non-elements.
    pub fn local_name(&self, h: Handle) -> Option<&str> {
        if let Some(data) = self.attribute_data(h) {
            return Some(&data.local_name);
        }
        if self.node_type(h) != NodeType::Element {
            return None;
        }
        if self.is_new(h) {
            Some(self.new_ref(h).element_name())
        } else {
            Some(&self.buf.tag_names[self.buf.tag_id[h.idx()] as usize])
        }
    }

    /// tagName: uppercased for HTML-namespace elements (DOM contract), as-is otherwise.
    pub fn tag_name(&self, h: Handle) -> Option<String> {
        let ln = self.qualified_name(h)?;
        if self.namespace(h) == Namespace::Html {
            Some(ln.to_ascii_uppercase())
        } else {
            Some(ln.to_string())
        }
    }

    pub fn parent(&self, h: Handle) -> Option<Handle> {
        if let Some(&p) = self.parent_ov.get(h) {
            return p;
        }
        if self.is_new(h) {
            return None; // detached unless set via overlay
        }
        let p = self.buf.parent[h.idx()];
        if p < 0 {
            None
        } else {
            Some(Handle(p as u32))
        }
    }

    /// Live child list. Reads overlay if the node was structurally mutated,
    /// else walks the buffer first-child/next-sib chain (zero overlay alloc).
    pub fn children(&self, h: Handle) -> Vec<Handle> {
        if let Some(c) = self.children_ov.get(h) {
            return c.to_vec();
        }
        if self.is_new(h) {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut c = self.buf.first_child[h.idx()];
        while c >= 0 {
            out.push(Handle(c as u32));
            c = self.buf.next_sib[c as usize];
        }
        out
    }

    /// [`Self::first_child`] without allocating the child list.
    fn first_child_handle(&self, h: Handle) -> Option<Handle> {
        if let Some(list) = self.children_ov.get(h) {
            return list.first().copied();
        }
        if self.is_new(h) {
            return None;
        }
        let c = self.buf.first_child[h.idx()];
        (c >= 0).then_some(Handle(c as u32))
    }

    /// [`Self::next_sibling`] without allocating the parent's child list.
    fn next_sibling_handle(&self, h: Handle) -> Option<Handle> {
        let parent = self.parent(h)?;
        if let Some(list) = self.children_ov.get(parent) {
            let at = list.iter().position(|&child| child == h)?;
            return list.get(at + 1).copied();
        }
        let next = self.buf.next_sib[h.idx()];
        (next >= 0).then_some(Handle(next as u32))
    }

    /// Visit each child handle WITHOUT allocating a `Vec` — walks the child overlay
    /// if the node was structurally mutated, else the buffer first-child/next-sib
    /// chain straight off the `SoA`. Hot-path alternative to `children()` (which
    /// clones a `Vec<Handle>`) for callers that only iterate. Mirrors `for_each_attr`.
    pub fn for_each_child(&self, h: Handle, mut f: impl FnMut(Handle)) {
        if let Some(c) = self.children_ov.get(h) {
            for &child in c {
                f(child);
            }
            return;
        }
        if self.is_new(h) {
            return;
        }
        let mut c = self.buf.first_child[h.idx()];
        while c >= 0 {
            f(Handle(c as u32));
            c = self.buf.next_sib[c as usize];
        }
    }

    pub(crate) fn some_element_child(
        &self,
        root: Handle,
        mut pred: impl FnMut(Handle) -> bool,
    ) -> bool {
        let mut matches = |child| self.node_type(child) == NodeType::Element && pred(child);
        if let Some(children) = self.children_ov.get(root) {
            return children.iter().copied().any(matches);
        }
        if self.is_new(root) {
            return false;
        }
        let mut child = self.buf.first_child[root.idx()];
        while child >= 0 {
            if matches(Handle(child as u32)) {
                return true;
            }
            child = self.buf.next_sib[child as usize];
        }
        false
    }

    pub fn first_child(&self, h: Handle) -> Option<Handle> {
        self.children(h).first().copied()
    }
    pub fn last_child(&self, h: Handle) -> Option<Handle> {
        self.children(h).last().copied()
    }

    pub fn next_sibling(&self, h: Handle) -> Option<Handle> {
        let p = self.parent(h)?;
        let sibs = self.children(p);
        let i = sibs.iter().position(|&x| x == h)?;
        sibs.get(i + 1).copied()
    }
    pub fn previous_sibling(&self, h: Handle) -> Option<Handle> {
        let p = self.parent(h)?;
        let sibs = self.children(p);
        let i = sibs.iter().position(|&x| x == h)?;
        if i == 0 {
            None
        } else {
            sibs.get(i - 1).copied()
        }
    }

    // ----------------------------------------------------------------- attrs
    /// The element namespace URI, including null/custom namespaces created at runtime.
    pub fn namespace_uri(&self, h: Handle) -> Option<&str> {
        if let Some(data) = self.attribute_data(h) {
            return data.namespace.as_deref();
        }
        if self.node_type(h) != NodeType::Element {
            return None;
        }
        if let Some(metadata) = self.element_namespaces.get(&h) {
            return metadata.uri.as_deref();
        }
        match self.namespace(h) {
            Namespace::Html => Some("http://www.w3.org/1999/xhtml"),
            Namespace::Svg => Some("http://www.w3.org/2000/svg"),
            Namespace::MathMl => Some("http://www.w3.org/1998/Math/MathML"),
            Namespace::Other => None,
        }
    }
    pub fn prefix(&self, h: Handle) -> Option<&str> {
        if let Some(data) = self.attribute_data(h) {
            return data.prefix.as_deref();
        }
        self.element_namespaces
            .get(&h)
            .and_then(|metadata| metadata.prefix.as_deref())
    }
    pub fn qualified_name(&self, h: Handle) -> Option<&str> {
        if let Some(data) = self.attribute_data(h) {
            return Some(&data.qualified_name);
        }
        self.element_namespaces
            .get(&h)
            .map(|metadata| metadata.qualified_name.as_str())
            .or_else(|| self.local_name(h))
    }
    pub fn get_attribute(&self, h: Handle, name: &str) -> Option<&str> {
        if let Some(ov) = self.attrs_ov.get(h) {
            return ov.get(name);
        }
        if self.is_new(h) {
            return None;
        }
        let start = self.buf.attr_start[h.idx()];
        if start < 0 {
            return None;
        }
        for index in start as usize..start as usize + self.buf.attr_count[h.idx()] as usize {
            let local = &self.buf.attr_names[self.buf.attr_name_id[index] as usize];
            let prefix = &self.buf.attr_prefixes[self.buf.attr_prefix_id[index] as usize];
            let matches = if prefix.is_empty() {
                local == name
            } else {
                name.strip_prefix(prefix)
                    .and_then(|name| name.strip_prefix(':'))
                    == Some(local.as_str())
            };
            if matches {
                return Some(&self.buf.attr_values[self.buf.attr_value_id[index] as usize]);
            }
        }
        None
    }
    /// Borrow a scalar compatibility value from an exact namespace/local identity.
    /// Queries use this seam without allocating owned attribute records per element.
    pub fn get_attribute_ns_borrowed(
        &self,
        h: Handle,
        namespace: Option<&str>,
        local: &str,
    ) -> Option<&str> {
        let namespace = namespace.filter(|value| !value.is_empty());
        if let Some(overlay) = self.attrs_ov.get(h) {
            return match overlay {
                AttrList::Plain(rows) => namespace
                    .is_none()
                    .then(|| {
                        rows.iter()
                            .find(|(name, _)| name == local)
                            .map(|(_, value)| value.as_str())
                    })
                    .flatten(),
                AttrList::Namespaced(rows) => rows
                    .iter()
                    .find(|data| {
                        let namespace_matches = match (&data.ns, namespace) {
                            (None, None) => true,
                            (Some(actual), Some(expected)) => actual == expected,
                            _ => false,
                        };
                        namespace_matches && data.local == local
                    })
                    .map(|data| data.legacy.value.as_str()),
            };
        }
        if self.is_new(h) {
            return None;
        }
        let start = self.buf.attr_start[h.idx()];
        if start < 0 {
            return None;
        }
        for index in start as usize..start as usize + self.buf.attr_count[h.idx()] as usize {
            let name = &self.buf.attr_names[self.buf.attr_name_id[index] as usize];
            let prefix = &self.buf.attr_prefixes[self.buf.attr_prefix_id[index] as usize];
            let actual_namespace = if self.namespace(h) == Namespace::Html {
                None
            } else {
                parsed_attribute_namespace(prefix, name)
            };
            if actual_namespace == namespace && name == local {
                return Some(&self.buf.attr_values[self.buf.attr_value_id[index] as usize]);
            }
        }
        None
    }
    pub fn has_attribute(&self, h: Handle, name: &str) -> bool {
        self.get_attribute(h, name).is_some()
    }
    pub fn attributes(&self, h: Handle) -> Vec<(String, String)> {
        let mut result = Vec::new();
        self.for_each_attr(h, |name, value| {
            result.push((name.to_owned(), value.to_owned()));
        });
        result
    }
    /// Visit qualified names and values without allocating for ordinary HTML attributes.
    pub fn for_each_attr(&self, h: Handle, mut callback: impl FnMut(&str, &str)) {
        self.for_each_attr_namespace(h, |_, prefix, local, qualified, value| {
            if let Some(qualified) = qualified {
                callback(qualified, value);
            } else if prefix.is_empty() {
                callback(local, value);
            } else {
                callback(&format!("{prefix}:{local}"), value);
            }
        });
    }
    pub fn for_each_attr_full(&self, h: Handle, mut callback: impl FnMut(&str, &str, &str)) {
        self.for_each_attr_namespace(h, |_, prefix, local, _, value| {
            callback(prefix, local, value);
        });
    }
    fn for_each_attr_namespace(
        &self,
        h: Handle,
        mut callback: impl FnMut(Option<&str>, &str, &str, Option<&str>, &str),
    ) {
        if let Some(overlay) = self.attrs_ov.get(h) {
            overlay.for_each(callback);
            return;
        }
        if self.is_new(h) {
            return;
        }
        let start = self.buf.attr_start[h.idx()];
        if start < 0 {
            return;
        }
        for index in start as usize..start as usize + self.buf.attr_count[h.idx()] as usize {
            let prefix = &self.buf.attr_prefixes[self.buf.attr_prefix_id[index] as usize];
            let local = &self.buf.attr_names[self.buf.attr_name_id[index] as usize];
            let value = &self.buf.attr_values[self.buf.attr_value_id[index] as usize];
            let namespace = if self.namespace(h) == Namespace::Html {
                None
            } else {
                parsed_attribute_namespace(prefix, local)
            };
            callback(namespace, prefix, local, None, value);
        }
    }
    /// Owned namespace records suitable for cloning/import and native Attr wrappers.
    pub fn attributes_namespaced(&self, h: Handle) -> Vec<AttributeData> {
        let mut result = Vec::new();
        self.for_each_attr_namespace(h, |namespace, prefix, local, qualified, value| {
            let name = qualified.map_or_else(
                || {
                    if prefix.is_empty() {
                        local.to_owned()
                    } else {
                        format!("{prefix}:{local}")
                    }
                },
                str::to_owned,
            );
            result.push(AttributeData::new(namespace, &name, value));
        });
        result
    }
    pub fn attribute_namespaced(
        &self,
        node: Handle,
        namespace: Option<&str>,
        local: &str,
    ) -> Option<AttributeData> {
        self.native_attribute_namespaced(node, namespace, local)
            .map(|data| data.legacy)
    }
    fn native_attributes(&self, node: Handle) -> Vec<NativeAttribute> {
        self.attrs_ov.get(node).map_or_else(
            || {
                self.attributes_namespaced(node)
                    .into_iter()
                    .map(NativeAttribute::from_legacy)
                    .collect()
            },
            AttrList::native_records,
        )
    }
    fn native_attribute_namespaced(
        &self,
        node: Handle,
        namespace: Option<&str>,
        local: &str,
    ) -> Option<NativeAttribute> {
        let namespace = namespace
            .filter(|value| !value.is_empty())
            .map(DomString::from);
        self.native_attributes(node)
            .into_iter()
            .find(|record| record.ns == namespace && record.local == local)
    }
    /// A genuine Attr node, with stable identity independent of whether it is attached.
    pub fn create_attribute(
        &mut self,
        namespace: Option<&str>,
        qualified: &str,
        value: &str,
    ) -> Handle {
        self.push_node(NewNode::Attribute {
            data: Box::new(NativeAttribute::from_legacy(AttributeData::new(
                namespace, qualified, value,
            ))),
            owner: None,
        })
    }
    fn native_attribute_data(&self, node: Handle) -> Option<&NativeAttribute> {
        if !self.is_new(node) {
            return None;
        }
        match self.new_ref(node) {
            NewNode::Attribute { data, .. } => Some(data),
            _ => None,
        }
    }
    pub fn attribute_data(&self, node: Handle) -> Option<&AttributeData> {
        self.native_attribute_data(node).map(|data| &data.legacy)
    }
    pub fn attribute_owner(&self, node: Handle) -> Option<Handle> {
        if !self.is_new(node) {
            return None;
        }
        match self.new_ref(node) {
            NewNode::Attribute { owner, .. } => *owner,
            _ => None,
        }
    }
    pub fn attribute_node(
        &mut self,
        owner: Handle,
        namespace: Option<&str>,
        local: &str,
    ) -> Option<Handle> {
        self.attribute_node_key(
            owner,
            namespace.filter(|v| !v.is_empty()).map(DomString::from),
            DomString::from(local),
        )
    }
    fn attribute_node_key(
        &mut self,
        owner: Handle,
        namespace: Option<DomString>,
        local: DomString,
    ) -> Option<Handle> {
        let data = self
            .native_attributes(owner)
            .into_iter()
            .find(|record| record.ns == namespace && record.local == local)?;
        let key = (owner, namespace, local);
        if let Some(node) = self.attribute_nodes.get(&key) {
            return Some(*node);
        }
        let node = self.push_node(NewNode::Attribute {
            data: Box::new(data),
            owner: Some(owner),
        });
        self.attribute_nodes.insert(key, node);
        Some(node)
    }
    fn sync_attribute_node(&mut self, owner: Handle, data: &NativeAttribute) {
        let key = (owner, data.ns.clone(), data.local.clone());
        if let Some(node) = self.attribute_nodes.get(&key).copied() {
            if let NewNode::Attribute { data: current, .. } =
                self.new_nodes.get_mut(node, self.buf_len)
            {
                **current = data.clone();
            }
        }
    }
    fn detach_attribute_node(&mut self, owner: Handle, data: &NativeAttribute) {
        let key = (owner, data.ns.clone(), data.local.clone());
        if let Some(node) = self.attribute_nodes.remove(&key) {
            if let Some(units) = self.attribute_units.get(&key).cloned() {
                self.attribute_units
                    .insert((node, data.ns.clone(), data.local.clone()), units);
            }
            if let NewNode::Attribute { owner, .. } = self.new_nodes.get_mut(node, self.buf_len) {
                *owner = None;
            }
        }
    }
    pub fn set_attribute_node(
        &mut self,
        owner: Handle,
        node: Handle,
    ) -> Result<Option<Handle>, &'static str> {
        if self.node_type(owner) != NodeType::Element {
            return Err("TypeError");
        }
        let data = self
            .native_attribute_data(node)
            .cloned()
            .ok_or("TypeError")?;
        if self
            .attribute_owner(node)
            .is_some_and(|current| current != owner)
        {
            return Err("InUseAttributeError");
        }
        let replaced = self.attribute_node_key(owner, data.ns.clone(), data.local.clone());
        if replaced == Some(node) {
            return Ok(replaced);
        }
        if let Some(old) = replaced {
            let old_data = self.native_attribute_data(old).unwrap().clone();
            self.detach_attribute_node(owner, &old_data);
        }
        let units = self.node_value_utf16(node).unwrap_or_default();
        self.set_native_attribute_record(owner, &data);
        self.retain_native_attribute_value(owner, &data, &units);
        self.attribute_units
            .remove(&(node, data.ns.clone(), data.local.clone()));
        if let NewNode::Attribute { owner: current, .. } =
            self.new_nodes.get_mut(node, self.buf_len)
        {
            *current = Some(owner);
        }
        self.attribute_nodes
            .insert((owner, data.ns.clone(), data.local.clone()), node);
        Ok(replaced)
    }
    pub fn remove_attribute_node(
        &mut self,
        owner: Handle,
        node: Handle,
    ) -> Result<Handle, &'static str> {
        if self.attribute_owner(node) != Some(owner) {
            return Err("NotFoundError");
        }
        let data = self
            .native_attribute_data(node)
            .cloned()
            .ok_or("TypeError")?;
        self.remove_native_attribute_ns(owner, data.ns.as_ref(), &data.local);
        Ok(node)
    }
    pub fn set_attribute_value(&mut self, node: Handle, value: &str) {
        let Some(mut data) = self.native_attribute_data(node).cloned() else {
            return;
        };
        data.legacy.value = value.into();
        if let Some(owner) = self.attribute_owner(node) {
            self.set_native_attribute_record(owner, &data);
        } else {
            self.attribute_units
                .remove(&(node, data.ns.clone(), data.local.clone()));
            if let NewNode::Attribute { data: current, .. } =
                self.new_nodes.get_mut(node, self.buf_len)
            {
                **current = data;
            }
        }
    }
    fn set_native_attribute_record(&mut self, owner: Handle, data: &NativeAttribute) {
        let key = (owner, data.ns.clone(), data.local.clone());
        let old = self
            .native_attributes(owner)
            .into_iter()
            .find(|record| record.ns == data.ns && record.local == data.local)
            .map(|record| record.legacy.value.to_string());
        let old_units = if self.is_recording() {
            self.attribute_units.get(&key).cloned()
        } else {
            None
        };
        self.attribute_units.remove(&key);
        let styled = data.ns.is_some()
            || self.attribute_change_is_styled(owner, &data.local, Some(&data.legacy.value));
        self.ensure_attrs(owner).set_namespace(data.clone());
        self.sync_attribute_node(owner, data);
        self.bump_owner_attribute(owner, &data.local, styled);
        self.record_attributes(owner, &data.local_name, old, data.namespace.as_deref());
        self.record_old_units(old_units);
        self.record_native_attribute_names(data);
    }
    fn retain_native_attribute_value(
        &mut self,
        owner: Handle,
        data: &NativeAttribute,
        units: &[u16],
    ) {
        let key = (owner, data.ns.clone(), data.local.clone());
        if String::from_utf16(units).is_err() {
            self.attribute_units.insert(key, units.into());
        } else {
            self.attribute_units.remove(&key);
        }
    }
    fn remove_native_attribute_ns(
        &mut self,
        owner: Handle,
        namespace: Option<&DomString>,
        local: &DomString,
    ) {
        let Some(data) = self
            .native_attributes(owner)
            .into_iter()
            .find(|record| record.ns.as_ref() == namespace && record.local == *local)
        else {
            return;
        };
        let key = (owner, data.ns.clone(), data.local.clone());
        let old_units = if self.is_recording() {
            self.attribute_units.get(&key).cloned()
        } else {
            None
        };
        let styled = data.ns.is_some() || self.attribute_change_is_styled(owner, local, None);
        self.detach_attribute_node(owner, &data);
        self.attribute_units.remove(&key);
        self.ensure_attrs(owner).remove_ns(namespace, local);
        self.bump_owner_attribute(owner, local, styled);
        self.record_attributes(
            owner,
            &data.local_name,
            Some(data.value.to_string()),
            data.namespace.as_deref(),
        );
        self.record_old_units(old_units);
        self.record_native_attribute_names(&data);
    }

    /// The interned tag/label name for an element OR document-fragment node (the
    /// `<template>` synthetic `content` fragment carries the label "content").
    /// None for nodes without a tag id (text/comment/doctype/document).
    pub fn node_label(&self, h: Handle) -> Option<&str> {
        let nt = self.node_type(h);
        if nt != NodeType::Element && nt != NodeType::Fragment {
            return None;
        }
        if self.is_new(h) {
            return match self.new_ref(h) {
                NewNode::Fragment(label) => label.as_deref(),
                element => Some(element.element_name()),
            };
        }
        Some(&self.buf.tag_names[self.buf.tag_id[h.idx()] as usize])
    }

    /// DOCTYPE name / public id / system id (buffer-backed doctype nodes). The
    /// `SoA` stores all three as pooled strings (public/system "" when absent).
    pub fn doctype_name(&self, h: Handle) -> Option<&str> {
        if self.is_new(h) {
            return match self.new_ref(h) {
                NewNode::Doctype(value) => Some(&value.name),
                _ => None,
            };
        }
        self.doctype_field(h, &self.buf.text_id)
    }
    pub fn doctype_public_id(&self, h: Handle) -> Option<&str> {
        if self.is_new(h) {
            return match self.new_ref(h) {
                NewNode::Doctype(value) => Some(&value.public_id),
                _ => None,
            };
        }
        self.doctype_field(h, &self.buf.pub_id)
    }
    pub fn doctype_system_id(&self, h: Handle) -> Option<&str> {
        if self.is_new(h) {
            return match self.new_ref(h) {
                NewNode::Doctype(value) => Some(&value.system_id),
                _ => None,
            };
        }
        self.doctype_field(h, &self.buf.sys_id)
    }
    fn doctype_field<'a>(&'a self, h: Handle, col: &[i32]) -> Option<&'a str> {
        if self.node_type(h) != NodeType::Doctype || self.is_new(h) {
            return None;
        }
        let id = col[h.idx()];
        Some(self.buf.strings.get(id as usize).map_or("", |s| s.as_str()))
    }

    // ----------------------------------------------------------------- text
    /// The immutable target of a processing instruction.
    /// None for every other node (the parser never produces processing instructions,
    /// so only created ones have a target).
    pub fn processing_instruction_target(&self, h: Handle) -> Option<&str> {
        if !self.is_new(h) {
            return None;
        }
        match self.new_ref(h) {
            NewNode::ProcessingInstruction(value) => Some(&value.target),
            _ => None,
        }
    }

    pub fn node_value(&self, h: Handle) -> Option<String> {
        let nt = self.node_type(h);
        if nt == NodeType::Attribute {
            return self.attribute_data(h).map(|data| data.value.to_string());
        }
        if !matches!(
            nt,
            NodeType::Text
                | NodeType::CDataSection
                | NodeType::Comment
                | NodeType::ProcessingInstruction
        ) {
            return None;
        }
        if let Some(t) = self.text_ov.get(h) {
            return Some(t.to_string());
        }
        if self.is_new(h) {
            return Some(self.new_ref(h).char_data().to_string());
        }
        // buffer text/comment nodes always have text_id >= 0 (core pools every
        // string); .get + default keeps this total and coverable.
        let tid = self.buf.text_id[h.idx()];
        Some(
            self.buf
                .strings
                .get(tid as usize)
                .cloned()
                .unwrap_or_default(),
        )
    }

    /// textContent: concatenated descendant text.
    pub fn text_content(&self, h: Handle) -> String {
        let nt = self.node_type(h);
        if matches!(
            nt,
            NodeType::Attribute
                | NodeType::Text
                | NodeType::CDataSection
                | NodeType::Comment
                | NodeType::ProcessingInstruction
        ) {
            return self.node_value(h).unwrap_or_default();
        }
        let mut out = String::new();
        self.collect_text(h, &mut out);
        out
    }
    fn collect_text(&self, h: Handle, out: &mut String) {
        let mut pending = self.children(h);
        pending.reverse();
        while let Some(c) = pending.pop() {
            // Comment and Fragment share an empty body but are skipped for distinct,
            // separately-documented reasons — keep them as separate, commented arms.
            #[allow(clippy::match_same_arms)]
            match self.node_type(c) {
                NodeType::Text | NodeType::CDataSection => {
                    out.push_str(&self.node_value(c).unwrap_or_default());
                }
                NodeType::Comment => {}
                // A <template>'s content is stored as a synthetic `content` fragment
                // child, but in the DOM it lives in `template.content`, NOT among the
                // element's child nodes — so it must not contribute to textContent
                // (`template.textContent === ""`). It is the only fragment that ever
                // appears in a child list here. Serialization still walks it directly.
                NodeType::Fragment => {}
                _ => pending.extend(self.children(c).into_iter().rev()),
            }
        }
    }

    /// Set the optional planner for eligible bulk `:has()` selectors and invalidate query results.
    /// Pass None to restore the built-in policy.
    pub fn set_bulk_has_planner(&mut self, planner: Option<crate::BulkHasPlanner>) {
        self.bulk_has_planner = planner.map(crate::rtdom::query::BulkHasPlannerCallback::new);
        self.bump();
    }

    /// Set a capturing native planner for eligible bulk `:has()` selectors.
    pub fn set_bulk_has_planner_with(
        &mut self,
        planner: impl Fn(crate::HasFeatures) -> crate::HasRoute + 'static,
    ) {
        self.bulk_has_planner = Some(crate::rtdom::query::BulkHasPlannerCallback::new(planner));
        self.bump();
    }

    /// Select the committed host-specific route model for eligible bulk `:has()` queries.
    /// Pass `None` to use the generic native policy instead.
    pub fn set_bulk_has_host_policy(&mut self, host: Option<nwsapi_has::has_policy::Host>) {
        if self.bulk_has_host_policy != host {
            self.bulk_has_host_policy = host;
            self.bump();
        }
    }

    /// Whether a custom bulk `:has()` planner is currently registered.
    #[must_use]
    pub fn has_custom_bulk_has_planner(&self) -> bool {
        self.bulk_has_planner.is_some()
    }

    // ------------------------------------------------------------- mutations
    /// A mutation no node scope covers: every style generation moves.
    fn bump(&mut self) {
        self.bump_unscoped();
        self.global_style_gen = self.selector_version;
    }

    pub(crate) fn stylesheet_changed(&mut self) {
        self.bump();
        self.global_style_gen = self.selector_version;
    }

    fn invalidate_cssom_for_text_mutation(&mut self, node: Handle) {
        let mut current = Some(node);
        while let Some(ancestor) = current {
            if self.local_name(ancestor) == Some("style") {
                self.cssom_sheets.remove(&ancestor);
                break;
            }
            current = self.parent(ancestor);
        }
    }

    /// A mutation no element's style can read: a node created detached (it reaches a tree
    /// only through an insertion, which moves its own generation).
    fn bump_unscoped(&mut self) {
        self.version += 1;
        self.selector_version += 1;
    }

    /// A mutation of `h` itself (an attribute, its text, its state): its generation and its
    /// parent's child-list generations move. A parentless node records nothing: it has no
    /// style until an insertion, which moves its generation.
    pub(crate) fn bump_node(&mut self, h: Handle) {
        if matches!(
            self.node_type(h),
            NodeType::Text | NodeType::CDataSection | NodeType::Comment
        ) {
            self.invalidate_cssom_for_text_mutation(h);
        }
        self.bump_unscoped();
        if let Some(parent) = self.parent(h) {
            self.style_gens.insert(h, self.selector_version);
            let forward = self.next_sibling_handle(h).is_some();
            self.bump_child_gens(parent, forward);
        }
    }

    /// `child` inserted into or removed from `parent`; `forward`: it has (had) a next sibling.
    fn bump_child_list(&mut self, parent: Handle, child: Handle, forward: bool) {
        self.invalidate_cssom_for_text_mutation(parent);
        self.bump_unscoped();
        // Below a parentless node other than a document or shadow root nothing has a style
        // yet: inserting that node moves its generation.
        if self.parent(parent).is_some()
            || self.node_type(parent) == NodeType::Document
            || self.shadow_host(parent).is_some()
        {
            self.style_gens.insert(child, self.selector_version);
            self.bump_child_gens(parent, forward);
        }
        if self.touches_forms(parent) || self.has_form_content(child) {
            self.form_gen = self.selector_version;
        }
    }

    fn bump_child_gens(&mut self, parent: Handle, forward: bool) {
        let version = self.selector_version;
        let gens = self.child_gens.entry(parent).or_insert((0, 0));
        gens.0 = version;
        if forward {
            gens.1 = version;
        }
    }

    /// Whether `h` or an ancestor is an element whose validity, or whose descendants' form
    /// association, a change below it can move.
    fn touches_forms(&self, h: Handle) -> bool {
        let mut node = Some(h);
        while let Some(current) = node {
            if self.is_form_element(current) {
                return true;
            }
            node = self.parent(current);
        }
        false
    }

    /// Whether the subtree of `h` holds a form-associated (or possibly form-associated custom)
    /// element, or one naming its form owner.
    fn has_form_content(&self, h: Handle) -> bool {
        // Pre-order walk over the sibling links: no per-node child list.
        let mut node = h;
        loop {
            if self.is_form_element(node) || self.get_attribute(node, "form").is_some() {
                return true;
            }
            if let Some(child) = self.first_child_handle(node) {
                node = child;
                continue;
            }
            loop {
                if node == h {
                    return false;
                }
                if let Some(next) = self.next_sibling_handle(node) {
                    node = next;
                    break;
                }
                // invariant: `node` is a descendant of `h`, so it has a parent
                node = self.parent(node).expect("a descendant of the walk root");
            }
        }
    }

    fn is_form_element(&self, h: Handle) -> bool {
        self.local_name(h).is_some_and(|name| {
            name.contains('-')
                || matches!(
                    name,
                    "form"
                        | "fieldset"
                        | "input"
                        | "select"
                        | "textarea"
                        | "button"
                        | "output"
                        | "object"
                        | "option"
                        | "optgroup"
                        | "datalist"
                )
        })
    }

    /// [`Self::bump`] for an attribute change of `h`: a `style` attribute moves `version` only;
    /// a stylesheet owner's (`<style>` / `<link>`: `media`, `type`, `disabled`, ...) moves every
    /// style generation; any other moves `h`'s.
    fn bump_attribute(&mut self, h: Handle, name: &str, styled: bool) {
        if name == "style" {
            self.version += 1;
        } else {
            self.bump_owner_attribute(h, name, styled);
        }
    }

    fn bump_ordinary_attribute(&mut self, h: Handle, name: &str, styled: bool) {
        let previous_version = self.version;
        self.bump_attribute(h, name, styled);
        // Unqualified attributes other than class leave class membership and order intact.
        if !name.contains(':') && !name.eq_ignore_ascii_case("class") {
            self.query_candidates
                .get_mut()
                .preserve(previous_version, self.version);
        }
    }

    /// Move the style generation of `h` and its subtree (and its parent's child lists): what
    /// an embedder reports for the elements a newly added stylesheet can select. `quiet`
    /// moves `selector_version` but not `version` (an animation joining or leaving `h`: no
    /// DOM change, so version-keyed caches stay).
    pub fn invalidate_style(&mut self, h: Handle, quiet: bool) {
        if quiet {
            self.selector_version += 1;
            self.style_gens.insert(h, self.selector_version);
            if let Some(parent) = self.parent(h) {
                let forward = self.next_sibling_handle(h).is_some();
                self.bump_child_gens(parent, forward);
            }
        } else {
            self.bump_node(h);
        }
    }

    /// Report the selector features the embedder's computed styles follow (turbo-dom#279), or
    /// `None` when every attribute write can change a computed style (the default). Only
    /// `class`, `id`, `role`, `tabindex`, `title`, `aria-*` and `data-*` writes are filtered:
    /// no UA style or presentational hint reads them.
    pub fn set_style_filter(&mut self, filter: Option<StyleFilter>) {
        self.style_filter = filter;
    }

    /// Whether changing `name` of `h` from its current value to `new` can change a computed
    /// style through a selector (see [`Self::set_style_filter`]).
    fn attribute_change_is_styled(&self, h: Handle, name: &str, new: Option<&str>) -> bool {
        let Some(filter) = self.style_filter.as_ref() else {
            return true;
        };
        let old = self.get_attribute(h, name);
        match name {
            "class" => {
                let (old, new) = (old.unwrap_or(""), new.unwrap_or(""));
                // A token in one value but not the other that a selector names.
                let moved = |a: &str, b: &str| {
                    a.split_ascii_whitespace().any(|token| {
                        filter.classes.contains(token)
                            && !b.split_ascii_whitespace().any(|other| other == token)
                    })
                };
                moved(old, new) || moved(new, old)
            }
            "id" => [old, new]
                .into_iter()
                .flatten()
                .any(|id| filter.ids.contains(id)),
            _ if matches!(name, "role" | "tabindex" | "title")
                || name.starts_with("aria-")
                || name.starts_with("data-") =>
            {
                filter
                    .attributes
                    .contains(name.to_ascii_lowercase().as_str())
            }
            _ => true,
        }
    }

    /// An attribute of `h` other than `style` changed (see [`Self::bump_attribute`]).
    fn bump_owner_attribute(&mut self, h: Handle, name: &str, styled: bool) {
        if matches!(self.local_name(h), Some("style" | "link")) {
            self.bump();
        } else if styled {
            self.bump_node(h);
        } else {
            self.bump_unscoped();
        }
        self.bump_form_change(h, name);
    }

    /// A change of `h` that can move form validity (an attribute other than `class`, `style`,
    /// `aria-*`, `data-*`; text; form state) inside or of a form-associated element.
    fn bump_form_change(&mut self, h: Handle, name: &str) {
        let inert = matches!(name, "class" | "style" | "id" | "title" | "role" | "hidden")
            || name.starts_with("aria-")
            || name.starts_with("data-");
        if !inert && (self.touches_forms(h) || name == "form") {
            self.form_gen = self.selector_version;
        }
    }

    /// The style generation of `h` (turbo-dom#279): the latest `selector_version` at which a
    /// mutation reached what a selector matching `h` or one of its ancestors can read without
    /// `:has()` or other upward / document-wide dependencies — `h` and every ancestor (their
    /// attributes, state, insertion) and, by `scope`, the child lists along that chain (what
    /// `+`, `~`, `:nth-*`, `:*-of-type`, `:first-child` ... read; forward only, or both ways
    /// for `:last-child`, `:nth-last-*` ...) and form validity. Never below the last unscoped
    /// mutation. A cached computed style keyed on it is current while it holds.
    #[must_use]
    pub fn style_generation(&self, h: Handle, scope: StyleScope) -> u64 {
        let mut generation = self.global_style_gen;
        if scope.forms {
            generation = generation.max(self.form_gen);
        }
        let list_gen = |gens: &(u64, u64)| match scope.siblings {
            Siblings::None => 0,
            Siblings::Forward => gens.1,
            Siblings::Both => gens.0,
        };
        let mut node = Some(h);
        while let Some(current) = node {
            if let Some(&own) = self.style_gens.get(&current) {
                generation = generation.max(own);
            }
            node = self.parent(current);
            if let Some(gens) = node.and_then(|parent| self.child_gens.get(&parent)) {
                generation = generation.max(list_gen(gens));
            }
        }
        generation
    }

    /// Whether any element of the tree hosts a shadow root.
    pub fn has_shadow_roots(&self) -> bool {
        !self.shadow_root_of_host.is_empty()
    }

    fn record_event(
        &mut self,
        record: crate::rtdom::mutations::MutationRecord,
        previous_sibling: Option<Handle>,
        next_sibling: Option<Handle>,
        attribute_namespace: Option<&str>,
    ) {
        let mut inclusive_ancestors = Vec::new();
        let mut current = Some(record.target());
        while let Some(node) = current {
            inclusive_ancestors.push(node);
            // Mutation observation does not cross a shadow root into its host.
            current = self.parent(node);
        }
        self.mutation_log
            .as_mut()
            .unwrap()
            .push(crate::rtdom::mutations::MutationEvent {
                record,
                inclusive_ancestors,
                previous_sibling,
                next_sibling,
                attribute_namespace: attribute_namespace
                    .filter(|uri| !uri.is_empty())
                    .map(str::to_owned),
            });
    }

    /// Record a `childList` mutation IF recording is on (an observer is attached).
    /// Takes PRIMITIVES and early-returns BEFORE allocating the added/removed `Vec`s
    /// or the record — mirroring JS `notifyMutation` (dom.mjs:1501), which builds the
    /// `[added]`/`[removed]` arrays only after the no-observer early-return. The
    /// version bump is the CALLER's job and is always done unconditionally, so the
    /// no-observer path stays zero-alloc while caches still invalidate.
    fn record_child_list(
        &mut self,
        parent: Handle,
        added: Option<Handle>,
        removed: Option<Handle>,
        previous_sibling: Option<Handle>,
        next_sibling: Option<Handle>,
    ) {
        debug_assert!(self.is_recording(), "callers record only while recording");
        let rec = crate::rtdom::mutations::MutationRecord::child_list(
            parent,
            added.into_iter().collect(),
            removed.into_iter().collect(),
        );
        self.record_event(rec, previous_sibling, next_sibling, None);
    }

    /// Like `record_child_list` but for the batch case (`textContent` replacing a
    /// whole child list): only takes ownership of the already-built `Vec`s — which
    /// the caller produced for the actual mutation anyway — when recording.
    fn record_child_list_batch(
        &mut self,
        parent: Handle,
        added: Vec<Handle>,
        removed: Vec<Handle>,
    ) {
        if !self.is_recording() || added.is_empty() && removed.is_empty() {
            return;
        }
        let rec = crate::rtdom::mutations::MutationRecord::child_list(parent, added, removed);
        self.record_event(rec, None, None, None);
    }

    /// Record an `attributes` mutation IF recording is on. Takes the name as `&str`
    /// and only allocates the owned `String` (via `MutationRecord::attributes`) after
    /// the early-return — so a no-observer `set_attribute`/`remove_attribute` never
    /// builds the record's name string.
    fn record_attributes(
        &mut self,
        target: Handle,
        name: &str,
        old_value: Option<String>,
        namespace: Option<&str>,
    ) {
        if !self.is_recording() {
            return;
        }
        let rec = crate::rtdom::mutations::MutationRecord::attributes(target, name, old_value);
        self.record_event(rec, None, None, namespace);
    }

    /// Record a `characterData` mutation IF recording is on.
    fn record_character_data(&mut self, target: Handle, old_value: Option<String>) {
        if !self.is_recording() {
            return;
        }
        let rec = crate::rtdom::mutations::MutationRecord::character_data(target, old_value);
        self.record_event(rec, None, None, None);
    }

    /// Begin buffering mutation records (called by `MutationObserver::observe`).
    pub fn start_recording(&mut self) {
        self.mutation_log.get_or_insert_with(Vec::new);
    }
    /// Stop buffering and drop any pending records.
    pub fn stop_recording(&mut self) {
        self.mutation_log = None;
        self.mutation_old_units.clear();
        self.mutation_name_units.clear();
    }
    pub fn is_recording(&self) -> bool {
        self.mutation_log.is_some()
    }
    /// Drain the buffered records (keeps recording on). Empty if not recording.
    pub fn take_mutation_records(&mut self) -> Vec<crate::rtdom::mutations::MutationRecord> {
        self.take_mutation_events()
            .into_iter()
            .map(|event| event.record)
            .collect()
    }

    /// Drain records with their mutation-time ancestry, siblings and namespace.
    /// Shares the recording buffer with `take_mutation_records`; either drain
    /// consumes it. Embedders can fan out each event to multiple observer queues.
    pub fn take_mutation_events(&mut self) -> Vec<crate::rtdom::mutations::MutationEvent> {
        self.mutation_old_units.clear();
        self.mutation_name_units.clear();
        self.mutation_log
            .as_mut()
            .map_or_default(std::mem::take)
    }

    /// Ensure a node's attr overlay exists (copy buffer attrs in on first write).
    fn ensure_attrs(&mut self, h: Handle) -> &mut AttrList {
        if !self.attrs_ov.contains(h) {
            let init = AttrList::from_native_records(self.native_attributes(h));
            self.attrs_ov.insert(h, init);
        }
        self.attrs_ov.get_mut(h).unwrap()
    }

    pub fn set_attribute(&mut self, h: Handle, name: &str, value: &str) {
        let class_before =
            if name.eq_ignore_ascii_case("class") && self.attribute_is_scalar(h, "class") {
                Some(self.get_attribute(h, name).unwrap_or_default().to_owned())
            } else {
                None
            };
        let old = if self.is_recording() {
            self.get_attribute(h, name)
                .map(std::string::ToString::to_string)
        } else {
            None
        };
        let old_units = self.recorded_attribute_units(h, name);
        let styled = self.attribute_change_is_styled(h, name, Some(value));
        let ov = self.ensure_attrs(h);
        let changed = ov.set(name, value);
        self.attribute_units
            .remove(&(h, changed.ns.clone(), changed.local.clone()));
        self.sync_attribute_node(h, &changed);
        let previous_version = self.version;
        self.bump_ordinary_attribute(h, name, styled);
        if let Some(old) = class_before {
            self.query_candidates.get_mut().preserve_class_change(
                previous_version,
                self.version,
                &old,
                value,
            );
        }
        self.record_attributes(h, &changed.local_name, old, changed.namespace.as_deref());
        self.record_old_units(old_units);
        self.record_native_attribute_names(&changed);
    }

    pub fn remove_attribute(&mut self, h: Handle, name: &str) {
        let class_before =
            if name.eq_ignore_ascii_case("class") && self.attribute_is_scalar(h, "class") {
                Some(self.get_attribute(h, name).unwrap_or_default().to_owned())
            } else {
                None
            };
        let old = if self.is_recording() {
            self.get_attribute(h, name)
                .map(std::string::ToString::to_string)
        } else {
            None
        };
        let old_units = self.recorded_attribute_units(h, name);
        let styled = self.attribute_change_is_styled(h, name, None);
        let ov = self.ensure_attrs(h);
        let removed = ov.remove(name);
        if let Some(removed) = &removed {
            self.detach_attribute_node(h, removed);
            self.attribute_units
                .remove(&(h, removed.ns.clone(), removed.local.clone()));
        }
        let previous_version = self.version;
        self.bump_ordinary_attribute(h, name, styled);
        if let Some(old) = class_before {
            self.query_candidates.get_mut().preserve_class_change(
                previous_version,
                self.version,
                &old,
                "",
            );
        }
        if let Some(removed) = removed {
            self.record_attributes(h, &removed.local_name, old, removed.namespace.as_deref());
            self.record_old_units(old_units);
            self.record_native_attribute_names(&removed);
        }
    }

    /// Set a live IDL boolean form-state property (e.g. `FormProp::Checked`) on `h`,
    /// independently of the HTML attribute — the Rust analogue of assigning `el.checked`
    /// in the JS runtime. Form-state pseudo-classes (`:checked`/`:selected`/`:disabled`/
    /// `:required`/`:read-only`) read this first and fall back to the attribute when
    /// unset. Changed overrides bump the version so cached queries re-evaluate;
    /// invalid, reclaimed and non-element handles are ignored.
    pub fn set_form_property(&mut self, h: Handle, prop: FormProp, value: bool) {
        if self.is_live(h)
            && self.node_type(h) == NodeType::Element
            && self.form_props.insert((h, prop), value) != Some(value)
        {
            self.bump_node(h);
            self.bump_form_change(h, "");
        }
    }

    /// Clear a live form-state property override, reverting the pseudo-class to reading
    /// the HTML attribute. Bumps the version.
    pub fn clear_form_property(&mut self, h: Handle, prop: FormProp) {
        if self.form_props.remove(&(h, prop)).is_some() {
            self.bump_node(h);
            self.bump_form_change(h, "");
        }
    }

    /// The live override for a form-state property, or `None` when unset (⇒ the matcher
    /// reads the HTML attribute).
    #[must_use]
    pub fn form_property(&self, h: Handle, prop: FormProp) -> Option<bool> {
        self.form_props.get(&(h, prop)).copied()
    }

    /// Ensure a node's child overlay exists (copy buffer children in on first mutate).
    fn ensure_children(&mut self, h: Handle) -> &mut ChildList {
        if !self.children_ov.contains(h) {
            let init: ChildList = self.children(h).into();
            self.children_ov.insert(h, init);
        }
        self.children_ov.get_mut(h).unwrap()
    }

    fn detach(&mut self, child: Handle) {
        if let Some(parent) = self.parent(child) {
            self.remove_child(parent, child);
        }
    }

    /// Detach every current child of `h`, for the callers that overwrite the whole child
    /// list at once (`textContent` / `innerHTML` setters). Each prior child's `parent_ov`
    /// becomes `None`, so a consumer still holding a handle into the replaced subtree sees
    /// a detached node instead of a stale parent pointer that climbs back into the live
    /// tree. `remove_child` already does this on the one-at-a-time path.
    ///
    /// Allocation-free on the two shapes that matter: an existing overlay is moved out
    /// (`SmallVec`, inline up to 8), and an untouched buffer-backed node walks the `SoA`
    /// sibling chain directly rather than materializing `children()`.
    fn orphan_children(&mut self, h: Handle) {
        if let Some(list) = self.children_ov.get_mut(h) {
            // Leaves an empty overlay entry behind — every caller overwrites it immediately.
            let prior = std::mem::take(list);
            for &c in &prior {
                self.parent_ov.insert(c, None);
            }
            return;
        }
        if self.is_new(h) {
            return;
        }
        let mut c = self.buf.first_child[h.idx()];
        while c >= 0 {
            let next = self.buf.next_sib[c as usize];
            self.parent_ov.insert(Handle(c as u32), None);
            c = next;
        }
    }

    /// DOM pre-insert validity step 2: `node` is a host-including inclusive ancestor of
    /// `parent`, so inserting it there would build a parent cycle (Chrome:
    /// `HierarchyRequestError`).
    fn is_inclusive_ancestor(&self, node: Handle, parent: Handle) -> bool {
        let mut ancestor = Some(parent);
        while let Some(n) = ancestor {
            if n == node {
                return true;
            }
            ancestor = self.parent(n).or_else(|| self.shadow_host(n));
        }
        false
    }

    pub fn append_child(&mut self, parent: Handle, child: Handle) {
        if self.node_type(child) == NodeType::Attribute
            || self.node_type(parent) == NodeType::Attribute
            || self.is_inclusive_ancestor(child, parent)
        {
            return;
        }
        if self.node_type(child) == NodeType::Fragment {
            self.insert_nodes(parent, &[child], Anchor::Before(None), Vec::new());
            return;
        }
        self.detach(child);
        self.ensure_children(parent).push(child);
        self.parent_ov.insert(child, Some(parent));
        let forward = self.next_sibling_handle(child).is_some();
        self.bump_child_list(parent, child, forward);
        if self.is_recording() {
            self.record_child_list(
                parent,
                Some(child),
                None,
                self.previous_sibling(child),
                self.next_sibling(child),
            );
        }
    }

    pub fn insert_before(&mut self, parent: Handle, child: Handle, reference: Option<Handle>) {
        if self.node_type(child) == NodeType::Attribute
            || self.node_type(parent) == NodeType::Attribute
            || self.is_inclusive_ancestor(child, parent)
        {
            return;
        }
        if self.node_type(child) == NodeType::Fragment {
            self.insert_nodes(parent, &[child], Anchor::Before(reference), Vec::new());
            return;
        }
        // A node inserted before itself goes before its next sibling (DOM pre-insert).
        let reference = if reference == Some(child) {
            self.next_sibling(child)
        } else {
            reference
        };
        self.detach(child);
        let list = self.ensure_children(parent);
        match reference.and_then(|r| list.iter().position(|&x| x == r)) {
            Some(idx) => list.insert(idx, child),
            None => list.push(child),
        }
        self.parent_ov.insert(child, Some(parent));
        let forward = self.next_sibling_handle(child).is_some();
        self.bump_child_list(parent, child, forward);
        if self.is_recording() {
            self.record_child_list(
                parent,
                Some(child),
                None,
                self.previous_sibling(child),
                self.next_sibling(child),
            );
        }
    }

    pub fn remove_child(&mut self, parent: Handle, child: Handle) {
        if self.parent(child) != Some(parent) {
            return;
        }
        let siblings = self
            .is_recording()
            .then(|| (self.previous_sibling(child), self.next_sibling(child)));
        let forward = self.next_sibling_handle(child).is_some();
        let list = self.ensure_children(parent);
        if let Some(pos) = list.iter().position(|&x| x == child) {
            list.remove(pos);
        }
        self.parent_ov.insert(child, None);
        self.bump_child_list(parent, child, forward);
        if let Some((previous, next)) = siblings {
            self.record_child_list(parent, None, Some(child), previous, next);
        }
    }

    pub fn set_text_content(&mut self, h: Handle, text: &str) {
        let nt = self.node_type(h);
        if nt == NodeType::Attribute {
            self.set_attribute_value(h, text);
            return;
        }
        if matches!(
            nt,
            NodeType::Text
                | NodeType::CDataSection
                | NodeType::Comment
                | NodeType::ProcessingInstruction
        ) {
            let old = if self.is_recording() {
                self.node_value(h)
            } else {
                None
            };
            let old_units = self.recorded_character_units(h);
            self.text_ov.insert(h, text.into());
            self.bump_node(h);
            self.bump_form_change(h, "");
            self.record_character_data(h, old);
            self.record_old_units(old_units);
        } else {
            self.invalidate_cssom_for_text_mutation(h);
            // `removed` (the prior child list) is needed ONLY for a mutation record;
            // the overlay overwrite below ignores it. So snapshot it solely when
            // recording, and avoid cloning `added` on the no-observer path. Snapshot
            // BEFORE orphaning — `orphan_children` moves the child list out.
            let removed = if self.is_recording() {
                self.children(h)
            } else {
                Vec::new()
            };
            // The prior children leave the tree: clear their parent pointers so none of
            // them keeps reporting `parent() == h` after the overwrite below.
            self.orphan_children(h);
            // replace children with a single text node — but per the DOM spec, the EMPTY string
            // produces NO child node (the element ends up empty). React's createRoot clears the
            // container via `textContent = ''` and relies on it leaving zero children.
            let added = if text.is_empty() {
                Vec::new()
            } else {
                let t = self.create_text_node(text);
                self.parent_ov.insert(t, Some(h));
                vec![t]
            };
            if self.is_recording() {
                self.children_ov.insert(h, added.clone().into());
                self.bump_node(h);
                self.bump_form_change(h, "");
                self.record_child_list_batch(h, added, removed);
            } else {
                self.children_ov.insert(h, added.into());
                self.bump_node(h);
                self.bump_form_change(h, "");
            }
        }
    }

    // ---- CharacterData mutation (text/comment nodes) -------------------------------------------
    // The DOM's CharacterData methods use UTF-16 offsets/counts. Records a
    // characterData mutation so a MutationObserver (Lexical's editor model) sees the edit.
    /// Set the text of a text/comment node directly (`CharacterData.data` / `nodeValue` setter).
    pub fn set_node_value(&mut self, h: Handle, text: &str) {
        let nt = self.node_type(h);
        if nt == NodeType::Attribute {
            self.set_attribute_value(h, text);
            return;
        }
        if !matches!(
            nt,
            NodeType::Text | NodeType::CDataSection | NodeType::Comment
        ) {
            return;
        }
        let old = if self.is_recording() {
            self.node_value(h)
        } else {
            None
        };
        let old_units = self.recorded_character_units(h);
        self.text_ov.insert(h, text.into());
        self.bump_node(h);
        self.bump_form_change(h, "");
        self.record_character_data(h, old);
        self.record_old_units(old_units);
    }
    pub fn insert_data(&mut self, h: Handle, offset: usize, data: &str) {
        self.replace_data_utf16(h, offset, 0, &data.encode_utf16().collect::<Vec<_>>());
    }
    pub fn delete_data(&mut self, h: Handle, offset: usize, count: usize) {
        self.replace_data_utf16(h, offset, count, &[]);
    }
    pub fn append_data(&mut self, h: Handle, data: &str) {
        self.insert_data(h, usize::MAX, data);
    }
    pub fn replace_data(&mut self, h: Handle, offset: usize, count: usize, data: &str) {
        self.replace_data_utf16(h, offset, count, &data.encode_utf16().collect::<Vec<_>>());
    }
    pub fn substring_data(&self, h: Handle, offset: usize, count: usize) -> String {
        String::from_utf16_lossy(&self.substring_data_utf16(h, offset, count))
    }
    /// Split at a UTF-16 offset, including between paired surrogate code units.
    pub fn split_text(&mut self, h: Handle, offset: usize) -> Handle {
        self.split_text_utf16(h, offset)
    }

    // ------------------------------------------------------------- creation
    fn push_node(&mut self, node: NewNode) -> Handle {
        let h = Handle(self.next_handle);
        self.next_handle = self
            .next_handle
            .checked_add(1)
            .expect("DOM handle space exhausted");
        self.new_nodes.insert(h, node);
        h
    }

    pub fn create_element(&mut self, tag: &str) -> Handle {
        let h = self.push_node(NewNode::Element {
            name: tag.to_ascii_lowercase().into(),
            ns: Namespace::Html,
        });
        self.children_ov.insert(h, ChildList::new());
        self.attrs_ov.insert(h, AttrList::new());
        self.bump_unscoped();
        h
    }

    pub fn create_element_ns(&mut self, tag: &str, ns: Namespace) -> Handle {
        let h = self.push_node(NewNode::Element {
            name: tag.into(),
            ns,
        });
        self.children_ov.insert(h, ChildList::new());
        self.attrs_ov.insert(h, AttrList::new());
        self.bump_unscoped();
        h
    }

    /// Create a namespace-aware element after the caller validates the qualified name.
    pub fn create_element_namespace(&mut self, namespace: Option<&str>, qualified: &str) -> Handle {
        let namespace = namespace.filter(|value| !value.is_empty());
        let (prefix, local) = qualified
            .split_once(':')
            .map_or((None, qualified), |(prefix, local)| (Some(prefix), local));
        let kind = match namespace {
            Some("http://www.w3.org/1999/xhtml") => Namespace::Html,
            Some("http://www.w3.org/2000/svg") => Namespace::Svg,
            Some("http://www.w3.org/1998/Math/MathML") => Namespace::MathMl,
            _ => Namespace::Other,
        };
        let node = self.create_element_ns(local, kind);
        self.element_namespaces.insert(
            node,
            ElementNamespace {
                uri: namespace.map(Into::into),
                prefix: prefix.map(Into::into),
                qualified_name: qualified.into(),
            },
        );
        node
    }

    pub fn create_text_node(&mut self, data: &str) -> Handle {
        let h = self.push_node(NewNode::Text(data.into()));
        self.bump_unscoped();
        h
    }

    /// Create a detached document fragment, without associating it with a shadow host.
    pub fn create_document_fragment(&mut self) -> Handle {
        let h = self.push_node(NewNode::Fragment(None));
        self.children_ov.insert(h, ChildList::new());
        self.bump_unscoped();
        h
    }

    /// Create an owned detached `DocumentType` node with its complete parser metadata.
    pub fn create_document_type(&mut self, name: &str, public_id: &str, system_id: &str) -> Handle {
        self.push_node(NewNode::Doctype(Box::new(DoctypeData {
            name: name.into(),
            public_id: public_id.into(),
            system_id: system_id.into(),
        })))
    }

    pub fn create_comment(&mut self, data: &str) -> Handle {
        let h = self.push_node(NewNode::Comment(data.into()));
        self.bump_unscoped();
        h
    }

    /// Create an owned detached processing instruction. DOM bindings validate
    /// XML names and the forbidden data terminator before calling this primitive.
    pub fn create_processing_instruction(&mut self, target: &str, data: &str) -> Handle {
        let h = self.push_node(NewNode::ProcessingInstruction(Box::new(
            ProcessingInstructionData {
                target: target.into(),
                data: data.into(),
            },
        )));
        self.bump_unscoped();
        h
    }

    /// Extract the parser's template-content fragment from its representation.
    /// Embedders install the fragment in the template's associated inert document.
    /// This internal representation change is not a DOM child-list mutation;
    /// ordinary light children are preserved, and the returned handle stays live.
    /// Like other detached components, retain it with an explicit pin when using
    /// `collect_unreachable`; extraction does not add a permanent storage root.
    pub fn take_template_contents(&mut self, template: Handle) -> Option<Handle> {
        if self.node_type(template) != NodeType::Element
            || self.namespace(template) != Namespace::Html
            || self.local_name(template) != Some("template")
        {
            return None;
        }
        let fragment = self.children(template).into_iter().find(|&child| {
            self.node_type(child) == NodeType::Fragment && !self.is_shadow_root(child)
        })?;
        let recording = self.mutation_log.take();
        self.remove_child(template, fragment);
        self.mutation_log = recording;
        Some(fragment)
    }

    /// Parse `html` as a fragment in the context of element `h` and replace its
    /// children (innerHTML setter). Imported nodes become owned (new) nodes.
    pub fn set_inner_html(&mut self, h: Handle, html: &str) {
        let frag = self.parse_scalar_fragment(h, html);
        let removed = if self.is_recording() {
            self.children(h)
        } else {
            Vec::new()
        };
        // The prior children are replaced wholesale — detach them first so a retained
        // handle into the old subtree reports no parent rather than pointing back at `h`.
        self.orphan_children(h);
        let mut kids = Vec::with_capacity(frag.children.len());
        for c in &frag.children {
            kids.push(self.import_node(c));
        }
        for &k in &kids {
            self.parent_ov.insert(k, Some(h));
        }
        if self.is_recording() {
            self.children_ov.insert(h, kids.clone().into());
            self.bump_node(h);
            self.bump_form_change(h, "");
            if !kids.is_empty() || !removed.is_empty() {
                self.record_child_list_batch(h, kids, removed);
            }
        } else {
            self.children_ov.insert(h, kids.into());
            self.bump_node(h);
            self.bump_form_change(h, "");
        }
        core::discard_node(frag);
    }

    // ---- ChildNode / ParentNode manipulation (spec methods) -----------------------------------
    /// Insert `nodes` (in order) immediately before `h` within `h`'s parent. No-op if detached.
    pub fn before(&mut self, h: Handle, nodes: &[Handle]) {
        let Some(p) = self.parent(h) else { return };
        if nodes.iter().any(|&n| self.is_inclusive_ancestor(n, p)) {
            return;
        }
        // DOM: anchor after h's viable previous sibling (the first one not being moved).
        let sibs = self.children(p);
        let i = sibs.iter().position(|&x| x == h).unwrap_or(0);
        let previous = sibs[..i].iter().rev().copied().find(|s| !nodes.contains(s));
        self.insert_nodes(p, nodes, Anchor::After(previous), Vec::new());
    }
    /// The "viable next sibling" used by `after`/`replaceWith`: `h`'s first following
    /// sibling that is NOT itself in `nodes`. Per the DOM spec these methods anchor the
    /// insertion at this node, so a following sibling that is being moved by the call is
    /// skipped over (using it as the anchor would corrupt the order once it's detached).
    fn viable_next_sibling(&self, h: Handle, nodes: &[Handle]) -> Option<Handle> {
        let p = self.parent(h)?;
        let sibs = self.children(p);
        let i = sibs.iter().position(|&x| x == h)?;
        sibs[i + 1..].iter().copied().find(|s| !nodes.contains(s))
    }
    /// Insert `nodes` (in order) immediately after `h` within `h`'s parent.
    pub fn after(&mut self, h: Handle, nodes: &[Handle]) {
        let Some(p) = self.parent(h) else { return };
        if nodes.iter().any(|&n| self.is_inclusive_ancestor(n, p)) {
            return;
        }
        let next = self.viable_next_sibling(h, nodes);
        self.insert_nodes(p, nodes, Anchor::Before(next), Vec::new());
    }
    /// Replace `h` with `nodes` (in order) in `h`'s parent.
    pub fn replace_with(&mut self, h: Handle, nodes: &[Handle]) {
        let Some(p) = self.parent(h) else { return };
        if nodes.iter().any(|&n| self.is_inclusive_ancestor(n, p)) {
            return;
        }
        let next = self.viable_next_sibling(h, nodes);
        // h is replaced in the same record as the insertion, unless h is itself one of the
        // moved nodes (then it is simply moved).
        let replaced = if nodes.contains(&h) {
            Vec::new()
        } else {
            vec![h]
        };
        self.insert_nodes(p, nodes, Anchor::Before(next), replaced);
    }
    /// Replace all children of `h` with `nodes` (in order).
    pub fn replace_children(&mut self, h: Handle, nodes: &[Handle]) {
        if nodes.iter().any(|&n| self.is_inclusive_ancestor(n, h)) {
            return;
        }
        let replaced = self.children(h);
        self.insert_nodes(h, nodes, Anchor::Before(None), replaced);
    }

    /// Insert `nodes` (fragments flattened) into `parent` at `anchor`, removing `replaced`
    /// children of `parent` first, with ONE childList record for the whole change, as the
    /// DOM does when it converts `nodes` into a fragment. A node moved from another parent
    /// still records its removal there; a fragment records the removal of its children.
    fn flatten_fragment(&mut self, n: Handle, flat: &mut Vec<Handle>) {
        let kids = self.children(n);
        let log = self.mutation_log.take();
        for &k in &kids {
            self.remove_child(n, k);
        }
        self.mutation_log = log;
        if self.is_recording() && !kids.is_empty() {
            let rec =
                crate::rtdom::mutations::MutationRecord::child_list(n, Vec::new(), kids.clone());
            self.record_event(rec, None, None, None);
        }
        flat.extend(kids);
    }

    fn insert_nodes(
        &mut self,
        parent: Handle,
        nodes: &[Handle],
        anchor: Anchor,
        replaced: Vec<Handle>,
    ) {
        let mut flat = Vec::with_capacity(nodes.len());
        for &n in nodes {
            match self.node_type(n) {
                NodeType::Attribute => {}
                NodeType::Fragment => self.flatten_fragment(n, &mut flat),
                _ => {
                    self.detach(n);
                    flat.push(n);
                }
            }
        }
        let reference = match anchor {
            Anchor::Before(reference) => reference,
            Anchor::After(Some(previous)) => self.next_sibling(previous),
            Anchor::After(None) => self.first_child(parent),
        };
        let replaced: Vec<Handle> = replaced
            .into_iter()
            .filter(|&c| self.parent(c) == Some(parent))
            .collect();
        let log = self.mutation_log.take();
        for &c in &replaced {
            self.remove_child(parent, c);
        }
        let previous =
            reference.map_or_else(|| self.last_child(parent), |r| self.previous_sibling(r));
        for &n in &flat {
            self.insert_before(parent, n, reference);
        }
        self.mutation_log = log;
        if self.is_recording() && !(flat.is_empty() && replaced.is_empty()) {
            let rec = crate::rtdom::mutations::MutationRecord::child_list(parent, flat, replaced);
            self.record_event(rec, previous, reference, None);
        }
    }
    /// `insertAdjacentElement(position, element)` — position is beforebegin | afterbegin | beforeend
    /// | afterend (case-insensitive). Returns true if inserted.
    pub fn insert_adjacent_element(&mut self, h: Handle, position: &str, el: Handle) -> bool {
        let position = position.to_ascii_lowercase();
        // The node `el` goes into: `h`'s parent for beforebegin/afterend, else `h`.
        let target = match position.as_str() {
            "beforebegin" | "afterend" => self.parent(h),
            _ => Some(h),
        };
        if target.is_some_and(|t| self.is_inclusive_ancestor(el, t)) {
            return false;
        }
        match position.as_str() {
            "beforebegin" => {
                if self.parent(h).is_some() {
                    self.before(h, &[el]);
                    true
                } else {
                    false
                }
            }
            "afterend" => {
                if self.parent(h).is_some() {
                    self.after(h, &[el]);
                    true
                } else {
                    false
                }
            }
            "afterbegin" => {
                let first = self.first_child(h);
                self.insert_before(h, el, first);
                true
            }
            "beforeend" => {
                self.append_child(h, el);
                true
            }
            _ => false,
        }
    }
    /// `insertAdjacentHTML(position, html)` — parse `html` as a fragment (in `h`'s context for
    /// beforeend/afterbegin, else the parent's) and insert the resulting nodes at `position`.
    pub fn insert_adjacent_html(&mut self, h: Handle, position: &str, html: &str) {
        let pos = position.to_ascii_lowercase();
        let ctx_h = match pos.as_str() {
            "beforebegin" | "afterend" => self.parent(h).unwrap_or(h),
            _ => h,
        };
        let frag = self.parse_scalar_fragment(ctx_h, html);
        let kids: Vec<Handle> = frag.children.iter().map(|c| self.import_node(c)).collect();
        match pos.as_str() {
            "beforebegin" => self.before(h, &kids),
            "afterend" => self.after(h, &kids),
            "afterbegin" => {
                let first = self.first_child(h);
                self.insert_nodes(h, &kids, Anchor::Before(first), Vec::new());
            }
            _ => self.insert_nodes(h, &kids, Anchor::Before(None), Vec::new()), // beforeend (default)
        }
        core::discard_node(frag);
    }
    /// `toggleAttribute(name, force?)` — add when absent (or force=Some(true)), remove when present
    /// (or force=Some(false)). Returns whether the attribute is present afterward.
    pub fn toggle_attribute(&mut self, h: Handle, name: &str, force: Option<bool>) -> bool {
        let present = self.has_attribute(h, name);
        let want = force.unwrap_or(!present);
        if want {
            if !present {
                self.set_attribute(h, name, "");
            }
            true
        } else {
            if present {
                self.remove_attribute(h, name);
            }
            false
        }
    }
    /// Namespace lookup compares the exact namespace URI and local name.
    pub fn get_attribute_ns(
        &self,
        h: Handle,
        namespace: Option<&str>,
        local: &str,
    ) -> Option<String> {
        self.get_attribute_ns_borrowed(h, namespace, local)
            .map(str::to_owned)
    }
    pub fn set_attribute_ns(
        &mut self,
        h: Handle,
        namespace: Option<&str>,
        qualified: &str,
        value: &str,
    ) {
        self.set_native_attribute_record(
            h,
            &NativeAttribute::from_legacy(AttributeData::new(namespace, qualified, value)),
        );
    }
    pub fn remove_attribute_ns(&mut self, h: Handle, namespace: Option<&str>, local: &str) {
        self.remove_native_attribute_ns(
            h,
            namespace
                .filter(|value| !value.is_empty())
                .map(DomString::from)
                .as_ref(),
            &DomString::from(local),
        );
    }

    /// Import parser intermediates on a heap stack, retaining native parent links.
    fn import_node(&mut self, node: &core::Node) -> Handle {
        let root = self.import_scalar_shallow(node);
        let mut pending = vec![(node, root)];
        while let Some((source, target)) = pending.pop() {
            let mut children = ChildList::new();
            for child in &source.children {
                let handle = self.import_scalar_shallow(child);
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

    fn import_scalar_shallow(&mut self, n: &core::Node) -> Handle {
        match NodeType::from_u8(n.node_type) {
            NodeType::Element => {
                let ns = ns_id(&n.namespace);
                let h = self.create_element_ns(&n.name, ns);
                for a in &n.attrs {
                    let namespace = if ns == Namespace::Html {
                        None
                    } else {
                        parsed_attribute_namespace(&a.prefix, &a.name)
                    };
                    let qualified = if a.prefix.is_empty() {
                        a.name.clone()
                    } else {
                        format!("{}:{}", a.prefix, a.name)
                    };
                    self.set_attribute_ns(h, namespace, &qualified, &a.value);
                }
                // fragment parsing reads the `is` value at creation, like the initial parse
                if ns == Namespace::Html
                    && n.attrs
                        .iter()
                        .any(|a| a.prefix.is_empty() && a.name == "is")
                {
                    self.custom_element_states
                        .insert(h, CustomElementState::Undefined);
                }
                h
            }
            NodeType::Fragment => self.create_document_fragment(),
            NodeType::Comment => self.create_comment(&n.value),
            _ => self.create_text_node(&n.value),
        }
    }

    /// Force every buffer-backed node into the owned overlay (attrs + children).
    /// Defeats laziness on purpose — only for the lazy-vs-eager A/B bench. After
    /// this, reads go through the `HashMap` overlay instead of the zero-alloc buffer.
    pub fn force_inflate_all(&mut self) {
        for h in (0..self.buf_len).map(Handle) {
            if self.node_type(h) == NodeType::Element {
                self.ensure_attrs(h);
            }
            self.ensure_children(h);
        }
    }

    // --------------------------------------------------------------- shadow DOM
    /// Attach a shadow root to `host` and return its handle (a FRAGMENT node).
    /// The shadow root is NOT a light child of the host — `children(host)` never
    /// includes it (encapsulation is free: queries over the light tree skip it).
    /// Populate it via `set_inner_html(shadow_root, ...)` or `append_child`.
    pub fn attach_shadow(&mut self, host: Handle) -> Handle {
        let sr = self.push_node(NewNode::Fragment(None));
        self.children_ov.insert(sr, ChildList::new());
        self.shadow_root_of_host.insert(host, sr);
        self.host_of_shadow_root.insert(sr, host);
        self.bump();
        sr
    }

    pub fn shadow_root(&self, host: Handle) -> Option<Handle> {
        self.shadow_root_of_host.get(&host).copied()
    }
    pub fn shadow_host(&self, shadow_root: Handle) -> Option<Handle> {
        self.host_of_shadow_root.get(&shadow_root).copied()
    }
    pub fn is_shadow_root(&self, h: Handle) -> bool {
        self.host_of_shadow_root.contains_key(&h)
    }

    /// The shadow root that contains `h`, if any (walk to the top of `h`'s tree;
    /// a node inside a shadow tree tops out at the shadow-root fragment).
    pub fn shadow_root_of(&self, h: Handle) -> Option<Handle> {
        let mut top = h;
        while let Some(p) = self.parent(top) {
            top = p;
        }
        if self.is_shadow_root(top) {
            Some(top)
        } else {
            None
        }
    }

    /// DFS document-order descendants of `root` (excluding `root`).
    pub fn descendants(&self, root: Handle) -> Vec<Handle> {
        let mut out = Vec::new();
        let mut stack: Vec<Handle> = self.children(root).into_iter().rev().collect();
        while let Some(h) = stack.pop() {
            out.push(h);
            for &c in self.children(h).iter().rev() {
                stack.push(c);
            }
        }
        out
    }

    /// Short-circuiting DFS over `root`'s descendant ELEMENTS (excluding `root`; template
    /// content is not a descendant — `for_each_light_child`):
    /// returns true as soon as `pred` does, WITHOUT materializing a descendant
    /// `Vec`. Children are pushed alloc-free (push then reverse the just-added
    /// segment) so traversal stays document-order. Mirrors the JS `someDescendant`;
    /// the alloc-free alternative to `descendants(h).into_iter().any(...)`.
    /// `root` itself (when an element) or any of its descendants satisfies `pred`.
    pub(crate) fn some_self_or_descendant(
        &self,
        root: Handle,
        mut pred: impl FnMut(Handle) -> bool,
    ) -> bool {
        if self.node_type(root) == NodeType::Element && pred(root) {
            return true;
        }
        self.some_descendant(root, pred)
    }

    pub(crate) fn some_descendant(
        &self,
        root: Handle,
        mut pred: impl FnMut(Handle) -> bool,
    ) -> bool {
        let mut stack: Vec<Handle> = Vec::new();
        let base = stack.len();
        self.for_each_light_child(root, |c| stack.push(c));
        stack[base..].reverse();
        while let Some(h) = stack.pop() {
            if self.node_type(h) == NodeType::Element && pred(h) {
                return true;
            }
            let base = stack.len();
            self.for_each_light_child(h, |c| stack.push(c));
            stack[base..].reverse();
        }
        false
    }

    /// Light-DOM nodes assigned to `slot` (a `<slot>` inside a shadow tree):
    /// the host's light element children whose `slot` attr equals the slot's
    /// `name` (default "" ↔ unnamed slot). Mirrors `assignedNodes`.
    pub fn assigned_nodes(&self, slot: Handle) -> Vec<Handle> {
        // shadow_root_of yields a real shadow root (is_shadow_root ⇒ host exists),
        // so the only reachable miss is "slot not in any shadow tree".
        let Some(sr) = self.shadow_root_of(slot) else {
            return Vec::new();
        };
        let Some(host) = self.shadow_host(sr) else {
            return Vec::new();
        };
        if self.local_name(slot) != Some("slot") || !self.is_html(slot) {
            return Vec::new();
        }
        let slot_name = self.get_attribute(slot, "name").unwrap_or("");
        let mut first_slot = None;
        self.some_descendant(sr, |candidate| {
            if self.local_name(candidate) == Some("slot")
                && self.is_html(candidate)
                && self.get_attribute(candidate, "name").unwrap_or("") == slot_name
            {
                first_slot = Some(candidate);
                true
            } else {
                false
            }
        });
        if first_slot != Some(slot) {
            return Vec::new();
        }
        self.children(host)
            .into_iter()
            .filter(|&c| matches!(self.node_type(c), NodeType::Element | NodeType::Text))
            .filter(|&c| self.get_attribute(c, "slot").unwrap_or("") == slot_name)
            .collect()
    }

    pub(crate) fn assigned_slot_in_shadow(
        &self,
        node: Handle,
        shadow_root: Handle,
    ) -> Option<Handle> {
        let host = self.shadow_host(shadow_root)?;
        if self.parent(node) != Some(host) {
            return None;
        }
        let name = match self.node_type(node) {
            NodeType::Element => self.get_attribute(node, "slot").unwrap_or(""),
            NodeType::Text => "",
            _ => return None,
        };
        let mut result = None;
        self.some_descendant(shadow_root, |candidate| {
            if self.local_name(candidate) == Some("slot")
                && self.is_html(candidate)
                && self.get_attribute(candidate, "name").unwrap_or("") == name
            {
                result = Some(candidate);
                true
            } else {
                false
            }
        });
        result
    }
}

fn ns_id(namespace: &str) -> Namespace {
    match namespace {
        "svg" => Namespace::Svg,
        "math" => Namespace::MathMl,
        _ => Namespace::Html,
    }
}

/// Where `Tree::insert_nodes` inserts: before a reference child (`None`: at the end), or
/// right after a previous sibling (`None`: at the start), resolved once the moved nodes
/// are detached.
#[derive(Clone, Copy)]
enum Anchor {
    Before(Option<Handle>),
    After(Option<Handle>),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(html: &str) -> Tree {
        Tree::parse(html)
    }

    #[test]
    fn created_document_types_keep_fields_and_order() {
        let mut tree = Tree::parse("<body></body>");
        let doc = tree.root();
        let html = tree.query_selector("html").unwrap();
        let doctype = tree.create_document_type("html", "public", "system");
        assert_eq!(tree.node_type(doctype), NodeType::Doctype);
        assert_eq!(tree.doctype_name(doctype), Some("html"));
        assert_eq!(tree.doctype_public_id(doctype), Some("public"));
        assert_eq!(tree.doctype_system_id(doctype), Some("system"));
        tree.insert_before(doc, doctype, Some(html));
        assert_eq!(tree.children(doc)[0], doctype);
        tree.remove_child(doc, doctype);
        assert_eq!(tree.doctype_name(doctype), Some("html"));
        assert_eq!(tree.compat_mode(), "BackCompat");
    }

    #[test]
    fn compatibility_mode_uses_parser_state() {
        let mut standards = Tree::parse("<!doctype html><body></body>");
        assert_eq!(standards.compat_mode(), "CSS1Compat");
        let root = standards.root();
        let doctype = standards
            .children(root)
            .into_iter()
            .find(|node| standards.node_type(*node) == NodeType::Doctype)
            .unwrap();
        standards.remove_child(root, doctype);
        assert_eq!(standards.compat_mode(), "CSS1Compat");
        assert_eq!(Tree::parse("<body></body>").compat_mode(), "BackCompat");
        assert_eq!(
            Tree::parse("<!doctype not-html><body></body>").compat_mode(),
            "BackCompat"
        );
        assert_eq!(Tree::parse("<!doctype html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"x\"><body></body>").compat_mode(), "CSS1Compat");
    }

    #[test]
    fn iframe_srcdoc_documents_are_never_quirks() {
        let units = |html: &str| html.encode_utf16().collect::<Vec<_>>();
        for html in [
            "<body><p><table></table></p></body>",
            "<!-- c --><body></body>",
        ] {
            assert_eq!(Tree::parse_utf16(&units(html)).compat_mode(), "BackCompat");
            for tree in [
                Tree::parse_srcdoc_utf16(&units(html)),
                Tree::parse_srcdoc_utf16_with_source_positions(&units(html)),
            ] {
                assert_eq!(tree.compat_mode(), "CSS1Compat", "{html}");
                assert!(tree.query_selector("body").is_some());
            }
        }
        // No-quirks tree construction closes the paragraph before a table.
        let quirks = Tree::parse_utf16(&units("<p><table></table>"));
        let srcdoc = Tree::parse_srcdoc_utf16(&units("<p><table></table>"));
        assert!(quirks.query_selector("p > table").is_some());
        assert!(srcdoc.query_selector("p > table").is_none());
        let positioned = Tree::parse_srcdoc_utf16_with_source_positions(&units("<div id=a></div>"));
        let div = positioned.query_selector("#a").unwrap();
        assert!(positioned.source_position(div).is_some());
    }

    #[test]
    fn reads_structure_from_buffer() {
        let tree = t("<div id=a><span class=x>hi</span><p>yo</p></div>");
        // find the div
        let mut div = None;
        for h in tree.handles() {
            if tree.local_name(h) == Some("div") {
                div = Some(h);
            }
        }
        let div = div.unwrap();
        assert_eq!(tree.tag_name(div).as_deref(), Some("DIV"));
        assert_eq!(tree.get_attribute(div, "id"), Some("a"));
        let kids = tree.children(div);
        assert_eq!(kids.len(), 2);
        assert_eq!(tree.local_name(kids[0]), Some("span"));
        assert_eq!(tree.local_name(kids[1]), Some("p"));
        assert_eq!(tree.text_content(div), "hiyo");
    }

    #[test]
    fn namespace_promotion_preserves_plain_attributes_and_same_named_attr_identity() {
        let mut tree = t("<div data-one='original'></div>");
        let div = tree.query_selector("div").unwrap();
        let plain = tree.attribute_node(div, None, "data-one").unwrap();
        tree.set_attribute_ns(div, Some("urn:first"), "p:shared", "first");
        let first = tree
            .attribute_node(div, Some("urn:first"), "shared")
            .unwrap();
        tree.set_attribute_ns(div, Some("urn:second"), "p:shared", "second");
        let second = tree
            .attribute_node(div, Some("urn:second"), "shared")
            .unwrap();
        assert_ne!(first, second);
        assert_eq!(tree.attributes_namespaced(div).len(), 3);
        assert_eq!(tree.attribute_owner(plain), Some(div));
        tree.set_attribute(div, "data-one", "updated");
        assert_eq!(tree.attribute_data(plain).unwrap().value, "updated");
        tree.set_attribute(div, "p:shared", "changed");
        assert_eq!(tree.attribute_data(first).unwrap().value, "changed");
        assert_eq!(tree.attribute_data(second).unwrap().value, "second");
        tree.remove_attribute(div, "p:shared");
        assert_eq!(tree.attribute_owner(first), None);
        assert_eq!(tree.attribute_owner(second), Some(div));
        assert_eq!(tree.get_attribute(div, "p:shared"), Some("second"));
        tree.remove_attribute_ns(div, Some("urn:second"), "shared");
        assert_eq!(tree.attribute_owner(second), None);
        assert_eq!(
            tree.attributes(div),
            vec![("data-one".into(), "updated".into())]
        );
    }

    #[test]
    fn set_attribute_is_cow_and_bumps_version() {
        let mut tree = t("<div id=a></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let v0 = tree.version;
        tree.set_attribute(div, "class", "card");
        assert!(tree.version > v0);
        assert_eq!(tree.get_attribute(div, "class"), Some("card"));
        // original buffer attr still readable through overlay
        assert_eq!(tree.get_attribute(div, "id"), Some("a"));
    }

    /// Find the first element named `name`.
    fn element(tree: &Tree, name: &str) -> Handle {
        tree.handles()
            .find(|&h| tree.local_name(h) == Some(name))
            .unwrap()
    }

    const OWN: StyleScope = StyleScope {
        siblings: Siblings::None,
        forms: false,
    };
    const FORWARD: StyleScope = StyleScope {
        siblings: Siblings::Forward,
        forms: false,
    };
    const BOTH: StyleScope = StyleScope {
        siblings: Siblings::Both,
        forms: false,
    };
    const FORMS: StyleScope = StyleScope {
        siblings: Siblings::None,
        forms: true,
    };

    /// turbo-dom#279: a mutation of an element moves the style generation of it and its
    /// descendants only; its parent, siblings and their subtrees keep theirs unless the read
    /// asks for sibling scope, which follows the child lists along the ancestor chain.
    #[test]
    fn style_generation_scopes_an_element_mutation_to_its_subtree() {
        let mut tree = t("<main><div><p><i></i></p></div><section><b></b></section></main>");
        let (main, div, p, i, section, b) = (
            element(&tree, "main"),
            element(&tree, "div"),
            element(&tree, "p"),
            element(&tree, "i"),
            element(&tree, "section"),
            element(&tree, "b"),
        );
        let gens = |tree: &Tree, scope| {
            [main, div, p, i, section, b].map(|h| tree.style_generation(h, scope))
        };
        let (own, both) = (gens(&tree, OWN), gens(&tree, BOTH));
        tree.set_attribute(p, "class", "x");
        let s = tree.selector_version;
        assert_eq!(gens(&tree, OWN), [own[0], own[1], s, s, own[4], own[5]]);
        // `p` is `div`'s only (so last) child: its children see it both ways only.
        assert_eq!(
            gens(&tree, BOTH),
            [both[0], both[1], s, s, both[4], both[5]]
        );
        assert_eq!(gens(&tree, FORWARD), gens(&tree, OWN));
        tree.set_attribute(div, "class", "y");
        let s2 = tree.selector_version;
        // `div` has a next sibling: `main`'s child list moved forward and both ways.
        assert_eq!(gens(&tree, OWN), [own[0], s2, s2, s2, own[4], own[5]]);
        assert_eq!(gens(&tree, FORWARD), [own[0], s2, s2, s2, s2, s2]);
        tree.set_attribute(section, "class", "z");
        let s3 = tree.selector_version;
        // `section` is the last child: forward readers below `div` keep theirs.
        assert_eq!(gens(&tree, FORWARD), [own[0], s2, s2, s2, s3, s3]);
        assert_eq!(gens(&tree, BOTH), [both[0], s3, s3, s3, s3, s3]);
    }

    /// Insertion and removal: an append moves the new child and the parent's child list both
    /// ways only; an insertion before a sibling, or removing a child that had a next sibling,
    /// moves it forward too.
    #[test]
    fn style_generation_tracks_insertion_position() {
        let mut tree = t("<ul><li></li></ul>");
        let (ul, li) = (element(&tree, "ul"), element(&tree, "li"));
        let forward = tree.style_generation(li, FORWARD);
        let last = tree.create_element("li");
        tree.append_child(ul, last);
        assert_eq!(tree.style_generation(last, OWN), tree.selector_version);
        assert_eq!(tree.style_generation(li, FORWARD), forward);
        assert_eq!(tree.style_generation(li, BOTH), tree.selector_version);
        let first = tree.create_element("li");
        tree.insert_before(ul, first, Some(li));
        assert_eq!(tree.style_generation(li, FORWARD), tree.selector_version);
        let before = tree.style_generation(last, FORWARD);
        tree.remove_child(ul, last);
        assert_eq!(tree.style_generation(li, FORWARD), before, "the last child");
        tree.remove_child(ul, first);
        assert_eq!(tree.style_generation(li, FORWARD), tree.selector_version);
        // Below a detached root nothing records; below a shadow root it does.
        let (detached, inner) = (tree.create_element("div"), tree.create_element("p"));
        let before = tree.style_generation(inner, OWN);
        tree.append_child(detached, inner);
        assert_eq!(tree.style_generation(inner, OWN), before);
        let shadow = tree.attach_shadow(li);
        let slotted = tree.create_element("b");
        tree.append_child(shadow, slotted);
        assert_eq!(tree.style_generation(slotted, OWN), tree.selector_version);
    }

    /// Form validity moves with changes inside or of form-associated elements, and with
    /// subtrees holding one inserted or removed anywhere, but not with presentational
    /// attributes or changes outside forms.
    #[test]
    fn style_generation_tracks_form_validity() {
        let mut tree = t("<form><div><input></div></form><p><span></span></p>");
        let (div, input, p, span) = (
            element(&tree, "div"),
            element(&tree, "input"),
            element(&tree, "p"),
            element(&tree, "span"),
        );
        let reader = |tree: &Tree| tree.style_generation(span, FORMS);
        let g0 = reader(&tree);
        tree.set_attribute(div, "class", "c");
        tree.set_attribute(input, "aria-invalid", "true");
        tree.set_attribute(input, "data-x", "1");
        tree.set_attribute(p, "title", "t");
        tree.set_attribute(span, "lang", "en");
        let g1 = reader(&tree);
        assert_eq!(
            g1,
            tree.style_generation(span, OWN),
            "only the span's own change"
        );
        tree.set_attribute(input, "required", "");
        assert_eq!(reader(&tree), tree.selector_version);
        let g2 = reader(&tree);
        tree.set_attribute(span, "form", "f");
        assert_eq!(
            reader(&tree),
            tree.selector_version,
            "a form owner reference"
        );
        let text = tree.create_text_node("x");
        tree.append_child(p, text);
        let g3 = reader(&tree);
        tree.set_node_value(text, "y");
        assert_eq!(reader(&tree), g3.max(tree.style_generation(span, OWN)));
        let plain = tree.create_element("div");
        tree.set_inner_html(plain, "<p><b></b></p><i></i>");
        let g4 = reader(&tree);
        tree.append_child(p, plain);
        assert_eq!(
            reader(&tree),
            g4.max(tree.style_generation(span, OWN)),
            "no control below"
        );
        let control = tree.create_element("x-control");
        let wrapper = tree.create_element("div");
        tree.append_child(wrapper, control);
        tree.append_child(p, wrapper);
        assert_eq!(
            reader(&tree),
            tree.selector_version,
            "a custom element subtree"
        );
        tree.set_form_property(input, FormProp::Checked, true);
        assert_eq!(reader(&tree), tree.selector_version);
        assert!(g0 <= g1 && g1 < g2);
    }

    /// With a style filter, writes of class tokens, ids and presentational attributes no
    /// selector names move no generation; other attributes always do.
    #[test]
    fn style_generation_follows_the_style_filter() {
        let mut tree = t("<div class='a on'><p></p></div>");
        let (div, p) = (element(&tree, "div"), element(&tree, "p"));
        let mut filter = StyleFilter::default();
        filter.classes.insert("on".into());
        filter.ids.insert("named".into());
        filter.attributes.insert("data-named".into());
        tree.set_style_filter(Some(filter));
        let g0 = tree.style_generation(p, OWN);
        tree.set_attribute(div, "class", "on b");
        tree.set_attribute(div, "id", "other");
        tree.set_attribute(div, "data-other", "1");
        tree.set_attribute(div, "aria-hidden", "true");
        tree.remove_attribute(div, "role");
        assert_eq!(
            tree.style_generation(p, OWN),
            g0,
            "unnamed tokens and attributes"
        );
        tree.set_attribute(div, "class", "b");
        assert_eq!(
            tree.style_generation(p, OWN),
            tree.selector_version,
            "on removed"
        );
        let g1 = tree.style_generation(p, OWN);
        tree.set_attribute(div, "data-named", "");
        assert!(tree.style_generation(p, OWN) > g1);
        let g2 = tree.style_generation(p, OWN);
        tree.set_attribute(div, "id", "named");
        assert!(tree.style_generation(p, OWN) > g2);
        let g3 = tree.style_generation(p, OWN);
        tree.set_attribute(div, "hidden", "");
        assert!(tree.style_generation(p, OWN) > g3, "every other attribute");
        let g4 = tree.style_generation(p, OWN);
        tree.set_attribute_ns(div, Some("urn:x"), "x:data-other", "1");
        assert!(tree.style_generation(p, OWN) > g4, "a namespaced attribute");
        let g5 = tree.style_generation(p, OWN);
        tree.set_attribute_units(
            div,
            &"class".encode_utf16().collect::<Vec<_>>(),
            &"b q".encode_utf16().collect::<Vec<_>>(),
        );
        tree.remove_attribute_ns(div, None, "data-other");
        assert_eq!(tree.style_generation(p, OWN), g5);
        tree.set_style_filter(None);
        tree.set_attribute(div, "class", "c");
        assert_eq!(tree.style_generation(p, OWN), tree.selector_version);
    }

    /// `invalidate_style` moves the subtree's generation; quietly, without the tree version.
    #[test]
    fn invalidate_style_moves_the_subtree_generation() {
        let mut tree = t("<div><p></p></div><span></span>");
        let (div, p, span) = (
            element(&tree, "div"),
            element(&tree, "p"),
            element(&tree, "span"),
        );
        let (version, other) = (tree.version, tree.style_generation(span, OWN));
        tree.invalidate_style(div, true);
        assert_eq!(tree.version, version);
        assert_eq!(tree.style_generation(p, OWN), tree.selector_version);
        assert_eq!(tree.style_generation(span, OWN), other);
        assert_eq!(tree.style_generation(span, FORWARD), tree.selector_version);
        tree.invalidate_style(span, false);
        assert!(tree.version > version);
        assert_eq!(tree.style_generation(span, OWN), tree.selector_version);
        let detached = tree.create_element("i");
        tree.invalidate_style(detached, true);
        assert_eq!(tree.style_generation(detached, OWN), tree.selector_version);
    }

    /// Which mutations move which generations: creating a detached node moves none, an inline
    /// style write moves none, and an unscoped change (a stylesheet owner's attribute, a
    /// shadow root, the fullscreen stack) moves every element's.
    #[test]
    fn style_generation_tracks_each_mutation_kind() {
        let mut tree = t("<style></style><div><p></p></div><span></span>");
        let (style, div, span) = (
            element(&tree, "style"),
            element(&tree, "div"),
            element(&tree, "span"),
        );
        let g0 = tree.style_generation(span, BOTH);
        let made = tree.create_element("em");
        tree.create_text_node("t");
        tree.set_attribute(span, "style", "color: red");
        assert_eq!(
            tree.style_generation(span, BOTH),
            g0,
            "inline style and detached nodes"
        );
        tree.set_attribute(made, "class", "detached");
        assert_eq!(
            tree.style_generation(made, OWN),
            g0,
            "a parentless node records nothing"
        );
        assert_eq!(tree.style_generation(span, BOTH), g0);
        let text = tree.create_text_node("x");
        tree.append_child(div, text);
        tree.set_node_value(text, "y");
        assert_eq!(tree.style_generation(text, OWN), tree.selector_version);
        assert!(tree.style_generation(span, OWN) < tree.selector_version);
        tree.set_attribute(style, "media", "print");
        assert_eq!(
            tree.style_generation(span, OWN),
            tree.selector_version,
            "a sheet owner"
        );
        tree.set_attribute(span, "lang", "en");
        let link = tree.create_element("link");
        tree.remove_attribute(link, "href");
        assert_eq!(tree.style_generation(div, OWN), tree.selector_version);
        tree.attach_shadow(div);
        assert_eq!(tree.style_generation(span, OWN), tree.selector_version);
    }

    /// `selector_version` moves with every mutation but a `style` attribute change: an
    /// element's inline style is read by selectors only through attribute selectors naming it,
    /// so an embedder that checks for those can keep other elements' computed styles across an
    /// inline style write (`version` still moves).
    #[test]
    fn selector_version_skips_style_attribute_changes_only() {
        let mut tree = t("<div id=a><p></p></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let (v0, s0) = (tree.version, tree.selector_version);
        tree.set_attribute(div, "style", "width: 1px");
        assert!(tree.version > v0);
        assert_eq!(tree.selector_version, s0);
        let v1 = tree.version;
        tree.remove_attribute(div, "style");
        assert!(tree.version > v1);
        assert_eq!(tree.selector_version, s0);
        tree.set_attribute(div, "class", "card");
        assert!(tree.selector_version > s0);
        let s1 = tree.selector_version;
        tree.remove_attribute(div, "class");
        assert!(tree.selector_version > s1);
        let s2 = tree.selector_version;
        let p = tree.create_element("p");
        tree.append_child(div, p);
        assert!(tree.selector_version > s2);
        assert!(!tree.has_shadow_roots());
        tree.attach_shadow(div);
        assert!(tree.has_shadow_roots());
    }

    #[test]
    fn append_and_remove_child() {
        let mut tree = t("<div></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let span = tree.create_element("span");
        tree.append_child(div, span);
        assert_eq!(tree.children(div), vec![span]);
        assert_eq!(tree.parent(span), Some(div));
        assert_eq!(tree.tag_name(span).as_deref(), Some("SPAN"));
        tree.remove_child(div, span);
        assert_eq!(tree.children(div), [] as [Handle; 0]);
        assert_eq!(tree.parent(span), None);
    }

    #[test]
    fn create_text_and_set_text_content() {
        let mut tree = t("<p>old</p>");
        let p = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("p"))
            .unwrap();
        tree.set_text_content(p, "new");
        assert_eq!(tree.text_content(p), "new");
    }

    #[test]
    fn document_fragments_move_children_without_inserting_the_fragment() {
        let mut tree = t("<main><i></i></main>");
        let parent = tree.query_selector("main").unwrap();
        let reference = tree.query_selector("i").unwrap();
        let fragment = tree.create_document_fragment();
        assert_eq!(tree.node_type(fragment), NodeType::Fragment);
        assert!(!tree.is_shadow_root(fragment));
        assert_eq!(tree.parent(fragment), None);
        let first = tree.create_element("b");
        let second = tree.create_text_node("text");
        tree.append_child(fragment, first);
        tree.append_child(fragment, second);
        tree.insert_before(parent, fragment, Some(reference));
        assert_eq!(tree.children(parent), vec![first, second, reference]);
        assert_eq!(tree.children(fragment), [] as [Handle; 0]);
        assert_eq!(tree.parent(fragment), None);
        assert_eq!(tree.parent(first), Some(parent));
        tree.append_child(fragment, reference);
        tree.append_child(parent, fragment);
        assert_eq!(tree.children(parent), vec![first, second, reference]);
        assert_eq!(tree.children(fragment), [] as [Handle; 0]);
    }

    #[test]
    fn fragment_self_and_ancestor_insertions_leave_the_tree_unchanged() {
        let mut tree = t("<main></main>");
        let fragment = tree.create_document_fragment();
        let parent = tree.create_element("div");
        let child = tree.create_element("b");
        tree.append_child(fragment, parent);
        tree.append_child(parent, child);
        tree.append_child(fragment, fragment);
        tree.insert_before(fragment, fragment, None);
        tree.append_child(child, fragment);
        tree.insert_before(parent, fragment, Some(child));
        assert_eq!(tree.children(fragment), vec![parent]);
        assert_eq!(tree.children(parent), vec![child]);
        assert_eq!(tree.children(child), [] as [Handle; 0]);
        assert_eq!(tree.parent(fragment), None);
    }

    #[test]
    fn importing_template_html_preserves_its_content_fragment() {
        let mut tree = t("<main></main>");
        let main = tree.query_selector("main").unwrap();
        tree.set_inner_html(main, "<template><b>content</b></template>");
        let template = tree.children(main)[0];
        let fragment = tree.children(template)[0];
        assert_eq!(tree.node_type(fragment), NodeType::Fragment);
        assert!(!tree.is_shadow_root(fragment));
        assert_eq!(tree.text_content(fragment), "content");
        let content = tree.children(fragment)[0];
        tree.append_child(main, fragment);
        assert_eq!(tree.children(main), vec![template, content]);
        assert_eq!(tree.children(fragment), [] as [Handle; 0]);
    }

    #[test]
    fn dump_accessors_doctype_prefix_label() {
        // doctype name + public/system ids
        let dt = t("<!DOCTYPE html PUBLIC \"-//W3C//DTD\" \"sys.dtd\"><html></html>");
        let doctype = dt
            .handles()
            .find(|&h| dt.node_type(h) == NodeType::Doctype)
            .unwrap();
        assert_eq!(dt.doctype_name(doctype), Some("html"));
        assert_eq!(dt.doctype_public_id(doctype), Some("-//W3C//DTD"));
        assert_eq!(dt.doctype_system_id(doctype), Some("sys.dtd"));
        // plain doctype: empty ids
        let dt2 = t("<!DOCTYPE html><html></html>");
        let d2 = dt2
            .handles()
            .find(|&h| dt2.node_type(h) == NodeType::Doctype)
            .unwrap();
        assert_eq!(dt2.doctype_public_id(d2), Some(""));
        // doctype accessors return None for non-doctype + new nodes
        let html = dt2.get_elements_by_tag_name("html")[0];
        assert_eq!(dt2.doctype_name(html), None);
        let mut m = t("<div></div>");
        let txt = m.create_text_node("x");
        assert_eq!(m.doctype_name(txt), None);

        // node_label: element, template-content fragment, and None for text
        let tpl = t("<template><i></i></template>");
        let frag = tpl
            .handles()
            .find(|&h| tpl.node_type(h) == NodeType::Fragment)
            .unwrap();
        assert_eq!(tpl.node_label(frag), Some("content"));
        let i = tpl
            .handles()
            .find(|&h| tpl.local_name(h) == Some("i"))
            .unwrap();
        assert_eq!(tpl.node_label(i), Some("i"));
        let txt2 = tpl.handles().find(|&h| tpl.node_type(h) == NodeType::Text);
        if let Some(tx) = txt2 {
            assert_eq!(tpl.node_label(tx), None);
        }
        // node_label for a created (is_new) element + a created fragment-less text
        let fresh = m.create_element("span");
        assert_eq!(m.node_label(fresh), Some("span"));
        assert_eq!(m.node_label(txt), None);

        // for_each_attr_full yields foreign-content prefix from the buffer
        let svg = t("<svg><a xlink:href=\"u\" id=\"k\"></a></svg>");
        let a = svg
            .handles()
            .find(|&h| svg.local_name(h) == Some("a"))
            .unwrap();
        let mut got = Vec::new();
        svg.for_each_attr_full(a, |p, n, v| got.push(format!("{p}|{n}={v}")));
        assert!(got.contains(&"xlink|href=u".to_string()));
        assert!(got.contains(&"|id=k".to_string()));
        // overlay + is_new paths → empty prefix / no calls
        let mut o = t("<b></b>");
        let b = o.handles().find(|&h| o.local_name(h) == Some("b")).unwrap();
        o.set_attribute(b, "class", "c");
        let mut ov = Vec::new();
        o.for_each_attr_full(b, |p, n, v| ov.push(format!("{p}|{n}={v}")));
        assert_eq!(ov, vec!["|class=c".to_string()]);
        let fresh_txt = o.create_text_node("z");
        o.for_each_attr_full(fresh_txt, |_, _, _| panic!("text has no attrs"));
    }

    #[test]
    fn for_each_attr_borrows_both_sources() {
        let tree = t("<a href=/x data-k=v>hi</a>");
        let a = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("a"))
            .unwrap();
        let mut buf = Vec::new();
        tree.for_each_attr(a, |n, v| buf.push(format!("{n}={v}")));
        assert_eq!(buf, vec!["href=/x".to_string(), "data-k=v".to_string()]);
        // overlay source after a mutation
        let mut t2 = t("<b>x</b>");
        let b = t2
            .handles()
            .find(|&h| t2.local_name(h) == Some("b"))
            .unwrap();
        t2.set_attribute(b, "class", "y");
        let mut ov = Vec::new();
        t2.for_each_attr(b, |n, v| ov.push(format!("{n}={v}")));
        assert_eq!(ov, vec!["class=y".to_string()]);
        // buffer element with NO attributes (start < 0) → no calls
        let t3 = t("<i>x</i>");
        let i = t3
            .handles()
            .find(|&h| t3.local_name(h) == Some("i"))
            .unwrap();
        let mut count = 0;
        t3.for_each_attr(i, |_, _| count += 1);
        assert_eq!(count, 0);
        // created text node (is_new, no attrs overlay) → hits the is_new return
        let mut t4 = t("<div></div>");
        let txt = t4.create_text_node("hello");
        t4.for_each_attr(txt, |_, _| count += 1);
        assert_eq!(count, 0);
    }

    #[test]
    fn some_descendant_short_circuits_over_elements() {
        let tree = t("<div id=root><section><span class=hit>x</span><b>y</b></section></div>");
        let root = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        // finds a descendant element matching the predicate
        assert!(tree.some_descendant(root, |d| tree.get_attribute(d, "class") == Some("hit")));
        // no matching descendant → false
        assert!(!tree.some_descendant(root, |d| tree.local_name(d) == Some("nope")));
        // visits ONLY elements: a text node is never passed to the predicate
        let mut saw_non_element = false;
        tree.some_descendant(root, |d| {
            if tree.node_type(d) != NodeType::Element {
                saw_non_element = true;
            }
            false
        });
        assert!(!saw_non_element);
        // short-circuit: stops at the first match (predicate call count bounded)
        let mut calls = 0;
        let found = tree.some_descendant(root, |d| {
            calls += 1;
            tree.local_name(d) == Some("section")
        });
        assert!(found);
        assert_eq!(
            calls, 1,
            "section is the first descendant element → exactly one call"
        );
        // a node with no descendants → false, no calls
        let empty = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("b"))
            .unwrap();
        let mut ec = 0;
        assert!(!tree.some_descendant(empty, |_| {
            ec += 1;
            true
        }));
        assert_eq!(ec, 0);
    }

    #[test]
    fn for_each_child_walks_buffer_overlay_and_new() {
        // buffer chain (first_child/next_sib): matches children() exactly
        let tree = t("<ul><li>1</li><li>2</li><li>3</li></ul>");
        let ul = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("ul"))
            .unwrap();
        let mut walked = Vec::new();
        tree.for_each_child(ul, |c| walked.push(c));
        assert_eq!(walked, tree.children(ul));
        // overlay source after a structural mutation
        let mut t2 = t("<div><a></a></div>");
        let div = t2
            .handles()
            .find(|&h| t2.local_name(h) == Some("div"))
            .unwrap();
        let b = t2.create_element("b");
        t2.append_child(div, b);
        let mut ov = Vec::new();
        t2.for_each_child(div, |c| ov.push(c));
        assert_eq!(ov, t2.children(div));
        // is_new node with no overlay (a created text node) → no calls
        let txt = t2.create_text_node("x");
        let mut count = 0;
        t2.for_each_child(txt, |_| count += 1);
        assert_eq!(count, 0);
    }

    #[test]
    fn set_inner_html_imports_fragment() {
        let mut tree = t("<div></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        tree.set_inner_html(div, "<span class=a>hi</span><b>x</b>");
        let kids = tree.children(div);
        assert_eq!(kids.len(), 2);
        assert_eq!(tree.local_name(kids[0]), Some("span"));
        assert_eq!(tree.get_attribute(kids[0], "class"), Some("a"));
        assert_eq!(tree.local_name(kids[1]), Some("b"));
        assert_eq!(tree.text_content(div), "hix");
        assert_eq!(tree.parent(kids[0]), Some(div));
    }

    #[test]
    fn shadow_root_encapsulation_and_slots() {
        let mut tree = t("<my-card><span slot=title>Hi</span><p>light</p></my-card>");
        let host = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("my-card"))
            .unwrap();
        let sr = tree.attach_shadow(host);
        tree.set_inner_html(
            sr,
            "<style>:host{color:red}</style><slot name=title></slot><slot></slot>",
        );
        // encapsulation: shadow content is NOT in the light tree
        assert!(tree.shadow_root_of_host.contains_key(&host));
        assert_eq!(tree.query_selector_all("slot").len(), 0); // light query skips shadow
                                                              // shadow_root_of resolves for shadow-internal nodes
        let slots = tree
            .descendants(sr)
            .into_iter()
            .filter(|&h| tree.local_name(h) == Some("slot"))
            .collect::<Vec<_>>();
        assert_eq!(slots.len(), 2);
        assert_eq!(tree.shadow_root_of(slots[0]), Some(sr));
        assert_eq!(tree.shadow_host(sr), Some(host));
        // assignedNodes: the named slot gets the span[slot=title]; default slot gets <p>
        let named = slots
            .iter()
            .find(|&&s| tree.get_attribute(s, "name") == Some("title"))
            .copied()
            .unwrap();
        let default = slots
            .iter()
            .find(|&&s| tree.get_attribute(s, "name").is_none())
            .copied()
            .unwrap();
        let an = tree.assigned_nodes(named);
        assert_eq!(an.len(), 1);
        assert_eq!(tree.local_name(an[0]), Some("span"));
        assert_eq!(tree.assigned_nodes(default).len(), 1); // the <p>
    }

    #[test]
    fn siblings() {
        let tree = t("<ul><li>1</li><li>2</li><li>3</li></ul>");
        let lis: Vec<_> = tree
            .handles()
            .filter(|&h| tree.local_name(h) == Some("li"))
            .collect();
        assert_eq!(tree.next_sibling(lis[0]), Some(lis[1]));
        assert_eq!(tree.previous_sibling(lis[2]), Some(lis[1]));
        assert_eq!(tree.next_sibling(lis[2]), None);
    }

    #[test]
    fn first_and_last_child() {
        let mut tree = t("<ul><li>1</li><li>2</li><li>3</li></ul>");
        let ul = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("ul"))
            .unwrap();
        let kids = tree.children(ul);
        assert_eq!(tree.first_child(ul), Some(kids[0]));
        assert_eq!(tree.last_child(ul), Some(kids[2]));
        // previous_sibling of the first child is None (index 0 branch)
        assert_eq!(tree.previous_sibling(kids[0]), None);
        // empty element: no first/last child
        let empty = tree.create_element("div");
        assert_eq!(tree.first_child(empty), None);
        assert_eq!(tree.last_child(empty), None);
    }

    #[test]
    fn native_attribute_nodes_keep_identity_live_values_and_single_owner() {
        let mut tree = Tree::parse("<div id='first'></div><p></p>");
        let owner = tree.get_elements_by_tag_name("div")[0];
        let other = tree.get_elements_by_tag_name("p")[0];
        let id = tree.attribute_node(owner, None, "id").unwrap();
        assert_eq!(tree.node_type_id(id), 2);
        assert_eq!(tree.attribute_node(owner, None, "id"), Some(id));
        tree.set_attribute(owner, "id", "changed");
        assert_eq!(tree.node_value(id).as_deref(), Some("changed"));
        tree.set_text_content(id, "live");
        assert_eq!(tree.get_attribute(owner, "id"), Some("live"));
        let replacement = tree.create_attribute(None, "id", "replacement");
        assert_eq!(tree.set_attribute_node(owner, replacement), Ok(Some(id)));
        assert_eq!(tree.attribute_owner(id), None);
        assert_eq!(tree.attribute_owner(replacement), Some(owner));
        assert_eq!(
            tree.set_attribute_node(other, replacement),
            Err("InUseAttributeError")
        );
        assert_eq!(
            tree.remove_attribute_node(owner, replacement),
            Ok(replacement)
        );
        assert_eq!(tree.node_value(replacement).as_deref(), Some("replacement"));
        assert_eq!(tree.get_attribute(owner, "id"), None);
        assert_eq!(tree.set_attribute_node(other, replacement), Ok(None));
        tree.set_node_value(replacement, "other");
        assert_eq!(tree.get_attribute(other, "id"), Some("other"));
        let namespaced = tree.create_attribute(Some("urn:test"), "one:name", "value");
        tree.set_attribute_node(other, namespaced).unwrap();
        tree.set_attribute_ns(other, Some("urn:test"), "two:name", "updated");
        assert_eq!(
            tree.attribute_node(other, Some("urn:test"), "name"),
            Some(namespaced)
        );
        assert_eq!(
            tree.attribute_data(namespaced).unwrap().prefix.as_deref(),
            Some("two")
        );
        tree.remove_attribute_ns(other, Some("urn:test"), "name");
        assert_eq!(tree.attribute_owner(namespaced), None);
        assert_eq!(tree.node_value(namespaced).as_deref(), Some("updated"));
    }

    #[test]
    fn namespace_attributes_keep_distinct_identity_and_parsed_metadata_after_mutation() {
        let mut tree =
            Tree::parse("<svg><a xlink:href='linked' href='plain' xml:lang='en'></a></svg>");
        let element = tree.get_elements_by_tag_name("a")[0];
        let xlink = "http://www.w3.org/1999/xlink";
        assert_eq!(
            tree.get_attribute_ns(element, Some(xlink), "href")
                .as_deref(),
            Some("linked")
        );
        assert_eq!(
            tree.get_attribute_ns(element, None, "href").as_deref(),
            Some("plain")
        );
        assert_eq!(
            tree.get_attribute_ns(element, Some("urn:wrong"), "href"),
            None
        );
        tree.set_attribute(element, "id", "mutated");
        assert_eq!(tree.get_attribute(element, "xlink:href"), Some("linked"));
        assert_eq!(
            tree.get_attribute_ns(element, Some(xlink), "href")
                .as_deref(),
            Some("linked")
        );
        tree.set_attribute_ns(element, Some("urn:first"), "same:name", "one");
        tree.set_attribute_ns(element, Some("urn:second"), "same:name", "two");
        assert_eq!(
            tree.get_attribute_ns(element, Some("urn:first"), "name")
                .as_deref(),
            Some("one")
        );
        assert_eq!(
            tree.get_attribute_ns(element, Some("urn:second"), "name")
                .as_deref(),
            Some("two")
        );
        tree.set_attribute_ns(element, Some("urn:first"), "new:name", "updated");
        let first = tree
            .attribute_namespaced(element, Some("urn:first"), "name")
            .unwrap();
        assert_eq!(first.prefix.as_deref(), Some("new"));
        assert_eq!(first.qualified_name, "new:name");
        tree.remove_attribute_ns(element, Some(xlink), "href");
        assert_eq!(
            tree.get_attribute_ns(element, None, "href").as_deref(),
            Some("plain")
        );
        assert!(
            crate::rtdom::serialize::serialize_outer(&tree, element).contains("xml:lang=\"en\"")
        );
    }

    #[test]
    fn custom_and_null_element_namespaces_preserve_qualified_names() {
        let mut tree = Tree::parse("");
        let element = tree.create_element_namespace(Some("urn:custom"), "prefix:MixedCase");
        assert_eq!(tree.namespace(element), Namespace::Other);
        assert_eq!(tree.namespace_uri(element), Some("urn:custom"));
        assert_eq!(tree.prefix(element), Some("prefix"));
        assert_eq!(tree.local_name(element), Some("MixedCase"));
        assert_eq!(tree.tag_name(element).as_deref(), Some("prefix:MixedCase"));
        assert_eq!(
            crate::rtdom::serialize::serialize_outer(&tree, element),
            "<prefix:MixedCase></prefix:MixedCase>"
        );
        let no_namespace = tree.create_element_namespace(None, "MixedCase");
        assert_eq!(tree.namespace_uri(no_namespace), None);
        assert_eq!(tree.local_name(no_namespace), Some("MixedCase"));
        let html = tree.create_element_namespace(Some("http://www.w3.org/1999/xhtml"), "MixedCase");
        assert_eq!(tree.tag_name(html).as_deref(), Some("MIXEDCASE"));
    }

    #[test]
    fn create_element_ns_keeps_case_and_namespace() {
        let mut tree = t("<div></div>");
        // SVG-namespace element: mixed-case local name preserved,
        // tag_name returns as-is (non-HTML namespace branch).
        let g = tree.create_element_ns("linearGradient", Namespace::Svg);
        assert_eq!(tree.namespace(g), Namespace::Svg);
        assert_eq!(tree.local_name(g), Some("linearGradient"));
        assert_eq!(tree.tag_name(g).as_deref(), Some("linearGradient"));
        // math namespace
        let m = tree.create_element_ns("mi", Namespace::MathMl);
        assert_eq!(tree.namespace(m), Namespace::MathMl);
        assert_eq!(tree.tag_name(m).as_deref(), Some("mi"));
    }

    #[test]
    fn new_node_reads_are_detached_and_empty() {
        let mut tree = t("<div></div>");
        let span = tree.create_element("span");
        // a freshly created (new) node with no parent overlay → detached
        assert_eq!(tree.parent(span), None);
        // get_attribute / has_attribute on an attr-less new node
        assert_eq!(tree.get_attribute(span, "id"), None);
        assert!(!tree.has_attribute(span, "id"));
        tree.set_attribute(span, "id", "x");
        assert!(tree.has_attribute(span, "id"));
        // attributes() on a brand-new text node (is_new, no attrs_ov) → empty
        let txt = tree.create_text_node("hi");
        assert_eq!(tree.attributes(txt), [] as [(String, String); 0]);
        // get_attribute on a new node lacking an attr overlay (text node) → None
        assert_eq!(tree.get_attribute(txt, "foo"), None);
    }

    #[test]
    fn node_value_text_comment_and_none() {
        let mut tree = t("<p>hi</p><!--c-->");
        // node_value on an element → None (not text/comment)
        let p = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("p"))
            .unwrap();
        assert_eq!(tree.node_value(p), None);
        // freshly created text node reads its data via is_new branch
        let txt = tree.create_text_node("hello");
        assert_eq!(tree.node_value(txt).as_deref(), Some("hello"));
        // a comment node from the buffer
        let comment = tree
            .handles()
            .find(|&h| tree.node_type(h) == NodeType::Comment)
            .unwrap();
        assert_eq!(tree.node_value(comment).as_deref(), Some("c"));
        // text_content of a comment goes through the text/comment branch
        assert_eq!(tree.text_content(comment), "c");
        // text_ov branch: mutate text content of the text node, read back
        tree.set_text_content(txt, "changed");
        assert_eq!(tree.node_value(txt).as_deref(), Some("changed"));
    }

    #[test]
    fn empty_buffer_text_node_value() {
        // An empty text node (text_id < 0) → node_value is empty string.
        let tree = t("<p></p>");
        // collect_text skips comments: a comment inside an element is ignored.
        let p = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("p"))
            .unwrap();
        assert_eq!(tree.text_content(p), "");
    }

    #[test]
    fn text_content_skips_comments() {
        // The NodeType::Comment arm of collect_text is exercised: comment text is NOT
        // concatenated into an element's text_content.
        let tree = t("<div>a<!--ignored-->b</div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        assert_eq!(tree.text_content(div), "ab");
    }

    #[test]
    fn set_attribute_updates_existing_slot() {
        let mut tree = t("<div id=a></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        // overwrite an existing attribute (the find-and-update slot branch)
        tree.set_attribute(div, "id", "b");
        assert_eq!(tree.get_attribute(div, "id"), Some("b"));
        assert_eq!(tree.attributes(div).len(), 1);
    }

    #[test]
    fn remove_attribute_works() {
        let mut tree = t("<div id=a class=x></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let v0 = tree.version;
        tree.remove_attribute(div, "id");
        assert!(tree.version > v0);
        assert!(!tree.has_attribute(div, "id"));
        assert_eq!(tree.get_attribute(div, "class"), Some("x"));
    }

    #[test]
    fn insert_before_with_reference_and_append() {
        let mut tree = t("<ul><li>1</li><li>2</li></ul>");
        let ul = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("ul"))
            .unwrap();
        let kids = tree.children(ul);
        let (a, b) = (kids[0], kids[1]);
        // insert before a reference node (the Some(idx) branch)
        let x = tree.create_element("li");
        tree.insert_before(ul, x, Some(b));
        assert_eq!(tree.children(ul), vec![a, x, b]);
        assert_eq!(tree.parent(x), Some(ul));
        // insert with None reference → append (the None branch)
        let y = tree.create_element("li");
        tree.insert_before(ul, y, None);
        assert_eq!(tree.children(ul), vec![a, x, b, y]);
        // detach-with-parent: re-inserting x moves it (detach removes from parent)
        tree.insert_before(ul, x, Some(a));
        assert_eq!(tree.children(ul), vec![x, a, b, y]);
        // reference that is not a child → falls through to append
        let z = tree.create_element("li");
        tree.insert_before(ul, z, Some(Handle(9999)));
        assert_eq!(tree.children(ul).last().copied(), Some(z));
    }

    #[test]
    fn set_text_content_on_element_replaces_children() {
        let mut tree = t("<div><span>old</span></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        // element branch: replaced with a single text node
        tree.set_text_content(div, "new");
        assert_eq!(tree.text_content(div), "new");
        let kids = tree.children(div);
        assert_eq!(kids.len(), 1);
        assert_eq!(tree.node_type(kids[0]), NodeType::Text);
        assert_eq!(tree.parent(kids[0]), Some(div));
    }

    // A subtree replaced wholesale must leave its old children DETACHED: a consumer that
    // still holds a handle into the replaced subtree and walks `parent()` upward has to
    // terminate at `None`, not climb back into the live tree (issue #4).
    #[test]
    fn set_text_content_orphans_the_replaced_children() {
        let mut tree = t("<div><span>old</span></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let span = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("span"))
            .unwrap();
        let inner = tree.children(span)[0];
        assert_eq!(tree.parent(span), Some(div));
        // buffer-backed node with no child overlay yet -> the `SoA` sibling-chain walk
        tree.set_text_content(div, "new");
        assert_eq!(tree.parent(span), None, "replaced child is detached");
        assert!(!tree.children(div).contains(&span));
        // the detached subtree itself stays intact — only its top link is cut
        assert_eq!(tree.parent(inner), Some(span));
        // and the empty-string (React container clear) path orphans too
        let mut tree = t("<div><span>old</span></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let span = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("span"))
            .unwrap();
        tree.set_text_content(div, "");
        assert_eq!(tree.children(div), [] as [Handle; 0]);
        assert_eq!(tree.parent(span), None);
    }

    #[test]
    fn set_inner_html_orphans_the_replaced_children() {
        let mut tree = t("<div></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        // append first so `div` has a child OVERLAY — the other `orphan_children` branch
        let kid = tree.create_element("p");
        tree.append_child(div, kid);
        assert_eq!(tree.parent(kid), Some(div));
        tree.set_inner_html(div, "<b>x</b>");
        assert_eq!(tree.parent(kid), None, "replaced child is detached");
        assert_eq!(tree.children(div).len(), 1);
        assert_eq!(tree.parent(tree.children(div)[0]), Some(div));
    }

    #[test]
    fn orphan_children_skips_a_created_node_with_no_child_overlay() {
        // Defensive branch: a CREATED node without a child overlay (a text node — only
        // created elements get one) has no `SoA` slot, so the chain walk must be skipped
        // rather than indexing the buffer out of range.
        let mut tree = t("<div></div>");
        let txt = tree.create_text_node("x");
        tree.set_inner_html(txt, "<b>y</b>");
        assert_eq!(tree.children(txt).len(), 1);
    }

    #[test]
    fn create_comment_node() {
        let mut tree = t("<div></div>");
        let v0 = tree.version;
        let c = tree.create_comment("note");
        assert!(tree.version > v0);
        assert_eq!(tree.node_type(c), NodeType::Comment);
        assert_eq!(tree.node_value(c).as_deref(), Some("note"));
    }

    #[test]
    fn processing_instruction_keeps_target_and_mutable_character_data() {
        let mut tree = Tree::parse("<body><p>text</p>");
        let pi = tree.create_processing_instruction("test", "a😀b");
        assert_eq!(tree.node_type(pi), NodeType::ProcessingInstruction);
        assert_eq!(tree.processing_instruction_target(pi), Some("test"));
        assert_eq!(tree.text_content(pi), "a😀b");
        tree.set_text_content(pi, "changed");
        assert_eq!(tree.node_value(pi).as_deref(), Some("changed"));
        assert_eq!(tree.processing_instruction_target(pi), Some("test"));
        let body = tree.query_selector("body").unwrap();
        tree.append_child(body, pi);
        assert_eq!(tree.text_content(body), "text");
        assert!(super::super::serialize::serialize_outer(&tree, body).contains("<?test changed?>"));
    }

    #[test]
    fn set_inner_html_imports_comment_and_svg() {
        let mut tree = t("<div></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        // imports an element, a comment (NodeType::Comment arm), and an svg element (ns).
        tree.set_inner_html(div, "<p>hi</p><!--c--><svg><circle r=5></circle></svg>");
        let kids = tree.children(div);
        // p, comment, svg
        let comment = kids
            .iter()
            .copied()
            .find(|&k| tree.node_type(k) == NodeType::Comment)
            .unwrap();
        assert_eq!(tree.node_value(comment).as_deref(), Some("c"));
        let svg = kids
            .iter()
            .copied()
            .find(|&k| tree.local_name(k) == Some("svg"))
            .unwrap();
        assert_eq!(tree.namespace(svg), Namespace::Svg);
        // svg child carries the svg namespace too
        let circle = tree
            .children(svg)
            .into_iter()
            .find(|&k| tree.local_name(k) == Some("circle"))
            .unwrap();
        assert_eq!(tree.namespace(circle), Namespace::Svg);
    }

    #[test]
    fn force_inflate_all_preserves_reads() {
        let mut tree = t("<div id=a><span class=x>hi</span></div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        tree.force_inflate_all();
        // after inflation reads go through overlays but stay correct
        assert_eq!(tree.get_attribute(div, "id"), Some("a"));
        let kids = tree.children(div);
        assert_eq!(tree.local_name(kids[0]), Some("span"));
        assert_eq!(tree.get_attribute(kids[0], "class"), Some("x"));
        assert_eq!(tree.text_content(div), "hi");
    }

    #[test]
    fn template_content_excluded_from_text_content() {
        // A <template>'s parsed content lives in a separate `content` document fragment,
        // NOT among the element's child nodes. Per the DOM, `template.textContent` is ""
        // and an ancestor's textContent does not include the template's content. (The JS
        // runtime mirrors this by excluding the synthetic content fragment from its
        // child iteration.)
        let tree = t("<div>before<template><p>hidden</p></template>after</div>");
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        assert_eq!(tree.text_content(div), "beforeafter");
        let tpl = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("template"))
            .unwrap();
        assert_eq!(tree.text_content(tpl), "");
    }

    #[test]
    fn after_and_replace_with_nodes_containing_next_sibling() {
        // DOM spec: ChildNode.after()/replaceWith() insert before the "viable next
        // sibling" — the first following sibling NOT in the argument list. When the
        // immediate next sibling IS one of the inserted nodes, it must be skipped.
        //
        // <a><b><c> ; a.after(b, x) → a, b, x, c
        let mut tree = t("<div><a></a><b></b><c></c></div>");
        let a = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("a"))
            .unwrap();
        let b = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("b"))
            .unwrap();
        let x = tree.create_element("x");
        tree.after(a, &[b, x]);
        let div = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("div"))
            .unwrap();
        let names: Vec<_> = tree
            .children(div)
            .iter()
            .map(|&h| tree.local_name(h).unwrap().to_string())
            .collect();
        assert_eq!(
            names,
            vec!["a", "b", "x", "c"],
            "after() must skip a next sibling that is itself being inserted"
        );

        // <a><b><c> ; a.replaceWith(b, x) → b, x, c
        let mut tree2 = t("<div><a></a><b></b><c></c></div>");
        let a2 = tree2
            .handles()
            .find(|&h| tree2.local_name(h) == Some("a"))
            .unwrap();
        let b2 = tree2
            .handles()
            .find(|&h| tree2.local_name(h) == Some("b"))
            .unwrap();
        let x2 = tree2.create_element("x");
        tree2.replace_with(a2, &[b2, x2]);
        let div2 = tree2
            .handles()
            .find(|&h| tree2.local_name(h) == Some("div"))
            .unwrap();
        let names2: Vec<_> = tree2
            .children(div2)
            .iter()
            .map(|&h| tree2.local_name(h).unwrap().to_string())
            .collect();
        assert_eq!(
            names2,
            vec!["b", "x", "c"],
            "replaceWith() must skip a next sibling that is itself being inserted"
        );
    }

    #[test]
    fn assigned_nodes_without_shadow_is_empty() {
        let tree = t("<div><span>x</span></div>");
        // a node not inside any shadow tree → shadow_root_of None → empty
        let span = tree
            .handles()
            .find(|&h| tree.local_name(h) == Some("span"))
            .unwrap();
        assert_eq!(tree.assigned_nodes(span), [] as [Handle; 0]);
    }

    #[test]
    fn assigned_nodes_use_first_matching_slot_in_shadow_tree_order() {
        let mut tree = t(
            "<x-host><b slot=named id=assigned></b><i slot=missing></i><u id=default></u></x-host>",
        );
        let host = tree
            .handles()
            .find(|&node| tree.local_name(node) == Some("x-host"))
            .unwrap();
        let shadow = tree.attach_shadow(host);
        tree.set_inner_html(
            shadow,
            "<section><slot name=named id=first></slot></section><slot name=named id=second></slot><slot></slot>",
        );
        let slots = tree.descendants(shadow);
        let by_id = |id| {
            slots
                .iter()
                .copied()
                .find(|&node| tree.get_attribute(node, "id") == Some(id))
                .unwrap()
        };
        let first = by_id("first");
        let second = by_id("second");
        let default = slots
            .iter()
            .copied()
            .find(|&node| {
                tree.local_name(node) == Some("slot") && tree.get_attribute(node, "name").is_none()
            })
            .unwrap();
        let assigned = tree
            .children(host)
            .into_iter()
            .find(|&node| tree.get_attribute(node, "id") == Some("assigned"))
            .unwrap();
        let default_node = tree
            .children(host)
            .into_iter()
            .find(|&node| tree.get_attribute(node, "id") == Some("default"))
            .unwrap();
        let text = tree.create_text_node("assigned text");
        tree.append_child(host, text);
        assert_eq!(tree.assigned_nodes(first), [assigned]);
        assert_eq!(tree.assigned_nodes(second), [] as [Handle; 0]);
        assert_eq!(tree.assigned_nodes(default), [default_node, text]);
    }
}
