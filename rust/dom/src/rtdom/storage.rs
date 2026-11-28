//! Opt-in native storage collection. Handles are never reused after collection.
use super::{AttrList, ChildList, Handle, NewNode, NodeArena, NodeType, Overlay, Tree};
use crate::core::Soa;
use rustc_hash::{FxHashMap, FxHashSet};

/// Limits host work before any storage is changed. The embedder supplies every
/// native handle whose lifetime is independent of the tree (ranges, iterators,
/// `XPath` snapshots, queued records and live JavaScript wrapper components).
#[derive(Debug, Clone, Copy)]
pub struct CollectionBudget {
    pub max_nodes: usize,
    pub max_edges: usize,
    /// Maximum logical retained payload, checked before node materialization.
    pub max_payload_bytes: usize,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollectionError {
    BudgetExceeded,
    InvalidPin,
    InvalidGraph,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StorageStats {
    pub live_nodes: usize,
    pub parsed_nodes: usize,
    pub runtime_slots: usize,
    /// Logical retained string payload, not allocator overhead.
    pub payload_bytes: usize,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CollectionReport {
    pub before: StorageStats,
    pub after: StorageStats,
    pub reclaimed_nodes: usize,
}

impl<T> Overlay<T> {
    fn collected() -> Self {
        Self {
            dense: Vec::new(),
            map: FxHashMap::default(),
            buf_len: 1,
            sparse: true,
        }
    }
}

impl Tree {
    /// Whether a stable handle is still present. Passing a reclaimed handle to
    /// ordinary DOM reads is a caller error; use this check at external seams.
    #[must_use]
    pub fn is_live(&self, h: Handle) -> bool {
        h.raw() < self.buf_len
            || match &self.new_nodes {
                NodeArena::Dense(nodes) => (h.raw() - self.buf_len) < nodes.len() as u32,
                NodeArena::Sparse(nodes) => nodes.contains_key(&h),
            }
    }

    #[must_use]
    pub fn storage_stats(&self) -> StorageStats {
        let mut payload_bytes = self
            .buf
            .tag_names
            .iter()
            .chain(&self.buf.attr_names)
            .chain(&self.buf.attr_prefixes)
            .chain(&self.buf.attr_values)
            .chain(&self.buf.strings)
            .map(String::len)
            .sum();
        for h in self.handles() {
            if self.is_new(h) {
                payload_bytes += node_bytes(self.new_ref(h));
            }
            if let Some(attrs) = self.attrs_ov.get(h) {
                payload_bytes += attrs.extra_bytes();
                attrs.for_each(|namespace, prefix, local, qualified, value| {
                    payload_bytes += namespace.map_or(0, str::len)
                        + prefix.len()
                        + local.len()
                        + qualified.map_or(0, str::len)
                        + value.len();
                });
            }
            if let Some(text) = self.text_ov.get(h) {
                payload_bytes += text.payload_bytes();
            }
        }
        for metadata in self.element_namespaces.values() {
            payload_bytes += metadata
                .uri
                .as_ref()
                .map_or(0, super::DomString::payload_bytes)
                + metadata
                    .prefix
                    .as_ref()
                    .map_or(0, super::DomString::payload_bytes)
                + metadata.qualified_name.payload_bytes();
        }
        payload_bytes += self.custom_state_payload_bytes(None);
        payload_bytes += self.mutation_payload_bytes();
        payload_bytes += self.utf16_extra_bytes(None);
        StorageStats {
            live_nodes: self.node_count() as usize,
            parsed_nodes: self.buf_len as usize,
            runtime_slots: self.new_nodes.len(),
            payload_bytes,
        }
    }

    fn charge_per_handle_attrs(
        &self,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<(), CollectionError> {
        for h in self.handles() {
            charge(work, 1, budget)?;
            let count = self.attrs_ov.get(h).map_or_else(
                || {
                    if self.is_new(h) {
                        0
                    } else {
                        usize::from(self.buf.attr_count[h.idx()])
                    }
                },
                |attrs| match attrs {
                    AttrList::Plain(rows) => rows.len(),
                    AttrList::Namespaced(rows) => rows.len(),
                },
            );
            charge(work, count, budget)?;
        }
        Ok(())
    }

    fn charge_metadata(
        &self,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<(), CollectionError> {
        charge(work, self.mutation_log.as_ref().map_or(0, Vec::len), budget)?;
        charge(
            work,
            self.source_attribute_positions
                .values()
                .map(FxHashMap::len)
                .sum::<usize>()
                + self.source_attribute_positions.len()
                + self.source_positions.len()
                + self.attribute_units.len()
                + self.mutation_old_units.len()
                + self.mutation_name_units.len(),
            budget,
        )?;
        for states in self.custom_states.values() {
            charge(work, 1 + states.len(), budget)?;
        }
        charge(work, self.custom_element_states.len(), budget)?;
        charge(work, self.fullscreen_stack.len(), budget)?;
        charge(work, self.selector_states.capacity(), budget)?;
        Ok(())
    }

    fn charge_preflight(
        &self,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<(), CollectionError> {
        for pool in [
            &self.buf.tag_names,
            &self.buf.attr_names,
            &self.buf.attr_prefixes,
            &self.buf.attr_values,
            &self.buf.strings,
        ] {
            charge(work, pool.len(), budget)?;
        }
        self.charge_per_handle_attrs(work, budget)?;
        self.charge_metadata(work, budget)
    }

    fn collect_roots(
        &self,
        pins: &[Handle],
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<Vec<Handle>, CollectionError> {
        let mut roots = vec![self.root()];
        roots.extend_from_slice(pins);
        if let Some(records) = &self.mutation_log {
            for event in records {
                charge(
                    work,
                    1 + event.record.added().len()
                        + event.record.removed().len()
                        + event.inclusive_ancestors.len()
                        + usize::from(event.previous_sibling.is_some())
                        + usize::from(event.next_sibling.is_some()),
                    budget,
                )?;
                roots.push(event.record.target());
                roots.extend_from_slice(event.record.added());
                roots.extend_from_slice(event.record.removed());
                roots.extend_from_slice(&event.inclusive_ancestors);
                roots.extend(event.previous_sibling);
                roots.extend(event.next_sibling);
                if roots.len() > budget.max_edges {
                    return Err(CollectionError::BudgetExceeded);
                }
            }
        }
        Ok(roots)
    }

    fn walk_retained(
        &self,
        roots: Vec<Handle>,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<FxHashSet<Handle>, CollectionError> {
        let mut retained = FxHashSet::default();
        let mut owned_attrs: FxHashMap<Handle, Vec<Handle>> = FxHashMap::default();
        for ((owner, _, _), attr) in &self.attribute_nodes {
            charge(work, 1, budget)?;
            owned_attrs.entry(*owner).or_default().push(*attr);
        }
        for mut h in roots {
            if !self.is_live(h) {
                return Err(CollectionError::InvalidPin);
            }
            self.walk_ancestors(&mut h, work, budget)?;
            self.walk_subtree(h, &owned_attrs, &mut retained, work, budget)?;
        }
        Ok(retained)
    }

    fn walk_ancestors(
        &self,
        h: &mut Handle,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<(), CollectionError> {
        let mut ancestors = FxHashSet::default();
        while let Some(parent) = self
            .parent(*h)
            .or_else(|| self.attribute_owner(*h))
            .or_else(|| self.shadow_host(*h))
        {
            charge(work, 1, budget)?;
            if !ancestors.insert(*h) || !self.is_live(parent) {
                return Err(CollectionError::InvalidGraph);
            }
            if self.parent(*h).is_none()
                && self.attribute_owner(*h).is_none()
                && self.shadow_root(parent) != Some(*h)
            {
                return Err(CollectionError::InvalidGraph);
            }
            *h = parent;
        }
        Ok(())
    }

    fn walk_visit_node(
        &self,
        node: Handle,
        owned_attrs: &FxHashMap<Handle, Vec<Handle>>,
        pending: &mut Vec<Handle>,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<(), CollectionError> {
        let children = self.children(node);
        charge(work, children.len(), budget)?;
        for child in children {
            if self.parent(child) != Some(node) {
                return Err(CollectionError::InvalidGraph);
            }
            pending.push(child);
        }
        if let Some(shadow) = self.shadow_root(node) {
            if self.shadow_host(shadow) != Some(node) {
                return Err(CollectionError::InvalidGraph);
            }
            pending.push(shadow);
        }
        if let Some(attrs) = owned_attrs.get(&node) {
            pending.extend_from_slice(attrs);
        }
        Ok(())
    }

    fn walk_subtree(
        &self,
        root: Handle,
        owned_attrs: &FxHashMap<Handle, Vec<Handle>>,
        retained: &mut FxHashSet<Handle>,
        work: &mut usize,
        budget: CollectionBudget,
    ) -> Result<(), CollectionError> {
        let mut pending = vec![root];
        while let Some(node) = pending.pop() {
            charge(work, 1, budget)?;
            if !self.is_live(node) {
                return Err(CollectionError::InvalidGraph);
            }
            if !retained.insert(node) {
                continue;
            }
            self.walk_visit_node(node, owned_attrs, &mut pending, work, budget)?;
        }
        Ok(())
    }

    /// Reclaim components unreachable from the document and supplied native
    /// pins. A retained descendant pins its complete composed component,
    /// including its ancestors, siblings, shadow trees and owned Attr nodes.
    /// Pending native mutation events are implicit pins until drained.
    ///
    /// No visible DOM mutation, mutation record, version increment or handle
    /// renumbering occurs. All checks precede the atomic storage replacement.
    /// Callers must supply *all* independently retained native handles. Omitted
    /// handles can be collected; this API cannot discover external Rust copies.
    pub fn collect_unreachable(
        &mut self,
        pins: &[Handle],
        budget: CollectionBudget,
    ) -> Result<CollectionReport, CollectionError> {
        if self.node_count() as usize > budget.max_nodes || pins.len() > budget.max_edges {
            return Err(CollectionError::BudgetExceeded);
        }
        let mut work = 0;
        self.charge_preflight(&mut work, budget)?;
        let before = self.storage_stats();
        let roots = self.collect_roots(pins, &mut work, budget)?;
        let required = roots.clone();
        let retained = self.walk_retained(roots, &mut work, budget)?;
        if required.iter().any(|node| !retained.contains(node)) {
            return Err(CollectionError::InvalidGraph);
        }
        // Admit expanded retained strings before cloning parser payloads. Shared
        // interned values can expand dramatically when each element is materialized.
        self.check_retained_payload_budget(&retained, &budget)?;
        // The parse buffer goes away: keep the creation-time custom element state it implies.
        self.record_parsed_states(retained.iter().copied());
        let (nodes, parents, children, attrs) = self.materialize_retained_overlays(&retained);
        self.buf = document_buffer();
        self.buf_len = 1;
        self.new_nodes = NodeArena::Sparse(nodes);
        self.parent_ov = parents;
        self.children_ov = children;
        self.attrs_ov = attrs;
        self.text_ov = Overlay::collected();
        self.attribute_units
            .retain(|(owner, _, _), _| retained.contains(owner));
        self.attribute_units.shrink_to_fit();
        self.element_namespaces.retain(|h, _| retained.contains(h));
        self.attribute_nodes
            .retain(|(owner, _, _), attr| retained.contains(owner) && retained.contains(attr));
        self.shadow_root_of_host
            .retain(|host, shadow| retained.contains(host) && retained.contains(shadow));
        self.host_of_shadow_root
            .retain(|shadow, host| retained.contains(host) && retained.contains(shadow));
        self.source_positions.retain(|h, _| retained.contains(h));
        self.source_positions.shrink_to_fit();
        self.source_attribute_positions
            .retain(|h, _| retained.contains(h));
        self.source_attribute_positions.shrink_to_fit();
        self.form_props.retain(|(h, _), _| retained.contains(h));
        self.custom_states.retain(|node, _| retained.contains(node));
        self.custom_states.shrink_to_fit();
        self.custom_element_states
            .retain(|node, _| retained.contains(node));
        self.custom_element_states.shrink_to_fit();
        self.fullscreen_stack.retain(|node| retained.contains(node));
        self.selector_states
            .retain(|(node, _)| retained.contains(node));
        self.selector_states.shrink_to_fit();
        self.element_namespaces.shrink_to_fit();
        self.attribute_nodes.shrink_to_fit();
        self.shadow_root_of_host.shrink_to_fit();
        self.host_of_shadow_root.shrink_to_fit();
        self.form_props.shrink_to_fit();
        *self.qcache.borrow_mut() = super::QueryCache::default();
        *self.css_cache.borrow_mut() = crate::rtdom::cascade::CssCache::default();
        let after = self.storage_stats();
        Ok(CollectionReport {
            reclaimed_nodes: before.live_nodes - after.live_nodes,
            before,
            after,
        })
    }

    /// Check that materializing `retained` into overlay storage stays within
    /// `budget.max_payload_bytes` — accounting for interned UTF-16 units,
    /// custom-state payloads and per-node projection costs.
    fn check_retained_payload_budget(
        &self,
        retained: &FxHashSet<Handle>,
        budget: &CollectionBudget,
    ) -> Result<(), CollectionError> {
        let mut projected_payload = self.mutation_payload_bytes()
            + self.utf16_extra_bytes(Some(retained))
            + self.custom_state_payload_bytes(Some(retained));
        if projected_payload > budget.max_payload_bytes {
            return Err(CollectionError::BudgetExceeded);
        }
        for &h in retained {
            projected_payload = projected_payload
                .checked_add(self.projected_node_bytes(h))
                .ok_or(CollectionError::BudgetExceeded)?;
            if projected_payload > budget.max_payload_bytes {
                return Err(CollectionError::BudgetExceeded);
            }
        }
        Ok(())
    }

    /// Materialize every retained node into fresh overlay storage, so the
    /// backing parse buffer can be dropped. Returns `(nodes, parents, children, attrs)`.
    #[allow(clippy::type_complexity)]
    fn materialize_retained_overlays(
        &self,
        retained: &FxHashSet<Handle>,
    ) -> (
        FxHashMap<Handle, NewNode>,
        Overlay<Option<Handle>>,
        Overlay<ChildList>,
        Overlay<AttrList>,
    ) {
        let mut nodes = FxHashMap::default();
        let mut parents = Overlay::collected();
        let mut children = Overlay::collected();
        let mut attrs = Overlay::collected();
        for &h in retained {
            if h != self.root() {
                nodes.insert(h, self.materialize_node(h));
            }
            parents.insert(h, self.parent(h));
            children.insert(h, self.children(h).into_iter().collect::<ChildList>());
            if self.node_type(h) == NodeType::Element {
                attrs.insert(h, AttrList::from_native_records(self.native_attributes(h)));
            }
        }
        (nodes, parents, children, attrs)
    }

    fn utf16_extra_bytes(&self, retained: Option<&FxHashSet<Handle>>) -> usize {
        let key_extras = self
            .attribute_nodes
            .keys()
            .filter(|(owner, _, _)| retained.is_none_or(|set| set.contains(owner)))
            .map(|(_, namespace, local)| {
                namespace.as_ref().map_or(0, super::DomString::extra_bytes) + local.extra_bytes()
            })
            .sum::<usize>();
        let mutation_names = self
            .mutation_name_units
            .values()
            .map(super::NativeMutationNames::bytes)
            .sum::<usize>();
        let position_names = self
            .source_attribute_positions
            .iter()
            .filter(|(owner, _)| retained.is_none_or(|set| set.contains(owner)))
            .flat_map(|(_, positions)| positions.keys())
            .map(|name| name.len() * 2)
            .sum::<usize>();
        position_names
            + mutation_names
            + key_extras
            + self
                .mutation_old_units
                .values()
                .map(|units| units.len() * 2)
                .sum::<usize>()
            + self
                .attribute_units
                .iter()
                .filter(|((owner, _, _), _)| retained.is_none_or(|set| set.contains(owner)))
                .map(|((_, namespace, local), units)| {
                    namespace
                        .as_ref()
                        .map_or(0, super::DomString::payload_bytes)
                        + local.payload_bytes()
                        + units.len() * 2
                })
                .sum::<usize>()
    }
    fn mutation_payload_bytes(&self) -> usize {
        self.mutation_log.as_ref().map_or(0, |events| {
            events
                .iter()
                .map(|event| {
                    event.record.attribute_name().map_or(0, str::len)
                        + event.record.old_value().map_or(0, str::len)
                        + event.attribute_namespace.as_ref().map_or(0, String::len)
                })
                .sum()
        })
    }

    fn character_payload_bytes(&self, node: Handle) -> usize {
        if let Some(value) = self.text_ov.get(node) {
            return value.payload_bytes();
        }
        if self.is_new(node) {
            return self
                .character_string(node)
                .map_or(0, super::DomString::payload_bytes);
        }
        self.buf
            .strings
            .get(self.buf.text_id[node.idx()] as usize)
            .map_or(0, String::len)
    }

    fn projected_node_bytes(&self, node: Handle) -> usize {
        // A new node's type is its variant; the parse buffer holds only document,
        // element, text, comment, doctype and template-content nodes.
        let mut bytes = if self.is_new(node) {
            match self.new_ref(node) {
                NewNode::Element { name, .. } => name.payload_bytes(),
                NewNode::Attribute { data, .. } => native_attribute_bytes(data),
                NewNode::Text(_) | NewNode::CData(_) | NewNode::Comment(_) => {
                    self.character_payload_bytes(node)
                }
                NewNode::ProcessingInstruction(data) => {
                    data.target.payload_bytes() + self.character_payload_bytes(node)
                }
                NewNode::Doctype(data) => {
                    data.name.payload_bytes()
                        + data.public_id.payload_bytes()
                        + data.system_id.payload_bytes()
                }
                NewNode::Fragment(label) => label.as_deref().map_or(0, str::len),
            }
        } else {
            match self.node_type(node) {
                NodeType::Document => 0,
                NodeType::Element => self.local_name(node).map_or(0, str::len),
                NodeType::Text | NodeType::Comment => self.character_payload_bytes(node),
                NodeType::Doctype => {
                    self.doctype_name(node).map_or(0, str::len)
                        + self.doctype_public_id(node).map_or(0, str::len)
                        + self.doctype_system_id(node).map_or(0, str::len)
                }
                NodeType::Fragment => self.node_label(node).map_or(0, str::len),
                NodeType::Attribute | NodeType::CDataSection | NodeType::ProcessingInstruction => {
                    unreachable!(
                        "the parser buffer holds no attribute, CDATA or processing instruction"
                    )
                }
            }
        };
        if self.node_type(node) == NodeType::Element {
            if let Some(attrs) = self.attrs_ov.get(node) {
                bytes += attrs.extra_bytes();
            }
            self.for_each_attr_namespace(node, |namespace, prefix, local, qualified, value| {
                let qualified_len = qualified.map_or_else(
                    || local.len() + prefix.len() + usize::from(!prefix.is_empty()),
                    str::len,
                );
                bytes += namespace.map_or(0, str::len)
                    + prefix.len()
                    + local.len()
                    + qualified_len
                    + value.len();
            });
        }
        if let Some(metadata) = self.element_namespaces.get(&node) {
            bytes += metadata
                .uri
                .as_ref()
                .map_or(0, super::DomString::payload_bytes)
                + metadata
                    .prefix
                    .as_ref()
                    .map_or(0, super::DomString::payload_bytes)
                + metadata.qualified_name.payload_bytes();
        }
        bytes
    }

    fn materialize_node(&self, h: Handle) -> NewNode {
        if self.is_new(h) {
            let mut node = self.new_ref(h).clone();
            // Only character nodes carry a text override.
            if let Some(value) = self.text_ov.get(h) {
                if let NewNode::ProcessingInstruction(data) = &mut node {
                    data.data = value.clone();
                } else if let NewNode::Text(data) | NewNode::CData(data) | NewNode::Comment(data) =
                    &mut node
                {
                    *data = value.clone();
                }
            }
            return node;
        }
        match self.node_type(h) {
            NodeType::Element => NewNode::Element {
                name: self.local_name(h).unwrap().into(),
                ns: self.namespace(h),
            },
            NodeType::Text => NewNode::Text(super::DomString::from_units(
                &self.node_value_utf16(h).unwrap_or_default(),
            )),
            NodeType::Comment => NewNode::Comment(super::DomString::from_units(
                &self.node_value_utf16(h).unwrap_or_default(),
            )),
            NodeType::Doctype => NewNode::Doctype(Box::new(super::DoctypeData {
                name: self.doctype_name(h).unwrap_or_default().into(),
                public_id: self.doctype_public_id(h).unwrap_or_default().into(),
                system_id: self.doctype_system_id(h).unwrap_or_default().into(),
            })),
            NodeType::Fragment => NewNode::Fragment(self.node_label(h).map(Into::into)),
            NodeType::Attribute
            | NodeType::CDataSection
            | NodeType::Document
            | NodeType::ProcessingInstruction => {
                unreachable!("only parser nodes are materialized")
            }
        }
    }
}
fn charge(
    work: &mut usize,
    amount: usize,
    budget: CollectionBudget,
) -> Result<(), CollectionError> {
    *work = work
        .checked_add(amount)
        .ok_or(CollectionError::BudgetExceeded)?;
    if *work > budget.max_edges {
        return Err(CollectionError::BudgetExceeded);
    }
    Ok(())
}
fn native_attribute_bytes(data: &super::NativeAttribute) -> usize {
    attribute_bytes(&data.legacy) + data.extra_bytes()
}
fn attribute_bytes(attr: &super::AttributeData) -> usize {
    attr.namespace.as_ref().map_or(0, smol_str::SmolStr::len)
        + attr.prefix.as_ref().map_or(0, smol_str::SmolStr::len)
        + attr.local_name.len()
        + attr.qualified_name.len()
        + attr.value.len()
}
fn node_bytes(node: &NewNode) -> usize {
    match node {
        NewNode::Element { name, .. } => name.payload_bytes(),
        NewNode::Attribute { data, .. } => native_attribute_bytes(data),
        NewNode::Text(s) | NewNode::CData(s) | NewNode::Comment(s) => s.payload_bytes(),
        NewNode::ProcessingInstruction(p) => p.target.payload_bytes() + p.data.payload_bytes(),
        NewNode::Doctype(d) => {
            d.name.payload_bytes() + d.public_id.payload_bytes() + d.system_id.payload_bytes()
        }
        NewNode::Fragment(label) => label.as_ref().map_or(0, smol_str::SmolStr::len),
    }
}
fn document_buffer() -> Soa {
    Soa {
        node_type: vec![9],
        ns: vec![0],
        tag_id: vec![0],
        parent: vec![-1],
        first_child: vec![-1],
        next_sib: vec![-1],
        text_id: vec![-1],
        pub_id: vec![-1],
        sys_id: vec![-1],
        attr_start: vec![-1],
        attr_count: vec![0],
        attr_name_id: vec![],
        attr_value_id: vec![],
        attr_prefix_id: vec![],
        tag_names: vec![],
        attr_names: vec![],
        attr_prefixes: vec![],
        attr_values: vec![],
        strings: vec![],
    }
}

/// Collection's graph checks against states the Tree API cannot build (P5-cov): each test
/// corrupts one overlay the way a bug in a mutation path would, and the collector must
/// refuse with `InvalidGraph` and leave every node and payload untouched.
#[cfg(test)]
mod integrity_tests {
    use super::super::{Handle, Tree};
    use super::{CollectionBudget, CollectionError};

    fn budget() -> CollectionBudget {
        CollectionBudget {
            max_nodes: 10_000,
            max_edges: 100_000,
            max_payload_bytes: 1_000_000,
        }
    }

    fn refused(tree: &mut Tree, pins: &[Handle], error: CollectionError) {
        let before = tree.storage_stats();
        let version = tree.version;
        assert_eq!(tree.collect_unreachable(pins, budget()), Err(error));
        assert_eq!(tree.storage_stats(), before);
        assert_eq!(tree.version, version);
    }

    #[test]
    fn a_parent_cycle_is_rejected() {
        let mut tree = Tree::parse("");
        let a = tree.create_element("a");
        tree.ensure_children(a).push(a);
        tree.parent_ov.insert(a, Some(a));
        refused(&mut tree, &[a], CollectionError::InvalidGraph);
        assert!(tree.is_live(a));
    }

    #[test]
    fn a_dead_child_is_rejected() {
        let mut tree = Tree::parse("<p></p>");
        let p = tree.query_selector("p").unwrap();
        let gone = tree.create_element("i");
        tree.collect_unreachable(&[], budget()).unwrap();
        assert!(!tree.is_live(gone));
        tree.ensure_children(p).push(gone);
        tree.parent_ov.insert(gone, Some(p));
        refused(&mut tree, &[], CollectionError::InvalidGraph);
    }

    #[test]
    fn a_child_whose_parent_points_elsewhere_is_rejected() {
        let mut tree = Tree::parse("<p></p><q></q>");
        let p = tree.query_selector("p").unwrap();
        let q = tree.query_selector("q").unwrap();
        let child = tree.create_element("i");
        tree.append_child(p, child);
        tree.parent_ov.insert(child, Some(q));
        refused(&mut tree, &[], CollectionError::InvalidGraph);
    }

    #[test]
    fn a_shadow_root_with_another_host_is_rejected() {
        let mut tree = Tree::parse("<p></p><q></q>");
        let p = tree.query_selector("p").unwrap();
        let q = tree.query_selector("q").unwrap();
        let shadow = tree.attach_shadow(p);
        tree.host_of_shadow_root.insert(shadow, q);
        refused(&mut tree, &[], CollectionError::InvalidGraph);
    }

    #[test]
    fn a_pinned_node_missing_from_its_parents_children_is_rejected() {
        let mut tree = Tree::parse("<p></p>");
        let p = tree.query_selector("p").unwrap();
        let orphan = tree.create_element("i");
        // the node claims a parent whose child list does not hold it
        tree.parent_ov.insert(orphan, Some(p));
        refused(&mut tree, &[orphan], CollectionError::InvalidGraph);
        // consistent again: it collects
        tree.ensure_children(p).push(orphan);
        assert!(tree.collect_unreachable(&[orphan], budget()).is_ok());
        assert!(tree.is_live(orphan));
    }

    #[test]
    fn pins_and_pending_records_count_against_the_edge_budget_together() {
        let mut tree = Tree::parse("");
        let root = tree.root();
        let el = tree.create_element("i");
        tree.start_recording();
        tree.append_child(root, el);
        let max_edges = 64;
        let bounds = CollectionBudget {
            max_edges,
            ..budget()
        };
        // the pins alone fit (pins.len() <= max_edges), the record's nodes push it over
        let pins = vec![root; max_edges];
        let before = tree.storage_stats();
        assert_eq!(
            tree.collect_unreachable(&pins, bounds),
            Err(CollectionError::BudgetExceeded)
        );
        assert_eq!(tree.storage_stats(), before);
        // the same pending record with one pin fits the same budget
        let report = tree.collect_unreachable(&[root], bounds).unwrap();
        assert_eq!(report.reclaimed_nodes, 0);
        assert!(tree.is_live(el));
    }
}
