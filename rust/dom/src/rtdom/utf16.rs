//! Lossless native character payloads. Ordinary UTF-8 values keep compact storage.
use super::{Handle, NewNode, NodeType, Tree};
use smol_str::SmolStr;
use std::fmt;

// The inline length reserves enum niches for heap payload variants. This keeps
// ordinary node records at the previous SmolStr size without unsafe tagging.
#[repr(u8)]
#[derive(Clone, Copy)]
pub(super) enum InlineLength {
    L0,
    L1,
    L2,
    L3,
    L4,
    L5,
    L6,
    L7,
    L8,
    L9,
    L10,
    L11,
    L12,
    L13,
    L14,
    L15,
    L16,
    L17,
    L18,
    L19,
    L20,
    L21,
    L22,
    L23,
}
const INLINE_LENGTHS: [InlineLength; 24] = [
    InlineLength::L0,
    InlineLength::L1,
    InlineLength::L2,
    InlineLength::L3,
    InlineLength::L4,
    InlineLength::L5,
    InlineLength::L6,
    InlineLength::L7,
    InlineLength::L8,
    InlineLength::L9,
    InlineLength::L10,
    InlineLength::L11,
    InlineLength::L12,
    InlineLength::L13,
    InlineLength::L14,
    InlineLength::L15,
    InlineLength::L16,
    InlineLength::L17,
    InlineLength::L18,
    InlineLength::L19,
    InlineLength::L20,
    InlineLength::L21,
    InlineLength::L22,
    InlineLength::L23,
];
#[derive(Clone)]
pub(super) enum DomString {
    Inline {
        length: InlineLength,
        bytes: [u8; 23],
    },
    Scalar(std::sync::Arc<str>),
    Units(std::sync::Arc<UnitPayload>),
}
#[derive(Clone)]
pub(super) struct UnitPayload {
    scalar: SmolStr,
    units: Box<[u16]>,
}
impl DomString {
    pub(super) fn from_units(units: &[u16]) -> Self {
        match String::from_utf16(units) {
            Ok(value) => Self::from(value),
            Err(_) => Self::Units(std::sync::Arc::new(UnitPayload {
                scalar: String::from_utf16_lossy(units).into(),
                units: units.into(),
            })),
        }
    }
    pub(super) fn units(&self) -> Vec<u16> {
        match self {
            Self::Units(value) => value.units.to_vec(),
            _ => self.as_str().encode_utf16().collect(),
        }
    }
    pub(super) fn as_str(&self) -> &str {
        match self {
            Self::Inline { length, bytes } => {
                std::str::from_utf8(&bytes[..*length as usize]).expect("immutable inline UTF8")
            }
            Self::Scalar(value) => value,
            Self::Units(value) => &value.scalar,
        }
    }
    pub(super) fn matches_units(&self, units: &[u16]) -> bool {
        match self {
            Self::Units(value) => value.units.as_ref() == units,
            _ => self.as_str().encode_utf16().eq(units.iter().copied()),
        }
    }
    pub(super) fn unpaired_units(&self) -> Option<Box<[u16]>> {
        match self {
            Self::Units(value) => Some(value.units.clone()),
            _ => None,
        }
    }
    pub(super) fn extra_bytes(&self) -> usize {
        match self {
            Self::Units(value) => value.units.len() * 2,
            _ => 0,
        }
    }
    pub(super) fn payload_bytes(&self) -> usize {
        self.as_str().len() + self.extra_bytes()
    }
}
impl From<&str> for DomString {
    fn from(value: &str) -> Self {
        if value.len() <= 23 {
            let mut bytes = [0; 23];
            bytes[..value.len()].copy_from_slice(value.as_bytes());
            Self::Inline {
                length: INLINE_LENGTHS[value.len()],
                bytes,
            }
        } else {
            Self::Scalar(value.into())
        }
    }
}
impl From<String> for DomString {
    fn from(value: String) -> Self {
        Self::from(value.as_str())
    }
}
impl std::ops::Deref for DomString {
    type Target = str;
    fn deref(&self) -> &str {
        self.as_str()
    }
}
impl fmt::Display for DomString {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.write_str(self.as_str())
    }
}
impl fmt::Debug for DomString {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Units(value) => fmt::Debug::fmt(&value.units, out),
            _ => fmt::Debug::fmt(self.as_str(), out),
        }
    }
}
impl PartialEq for DomString {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Units(a), Self::Units(b)) => a.units == b.units,
            (Self::Units(_), _) | (_, Self::Units(_)) => false,
            _ => self.as_str() == other.as_str(),
        }
    }
}
impl Eq for DomString {}
impl std::hash::Hash for DomString {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            Self::Units(value) => {
                std::hash::Hash::hash(&"native unpaired units", state);
                std::hash::Hash::hash(&value.units, state);
            }
            _ => std::hash::Hash::hash(self.as_str(), state),
        }
    }
}
/// A mutation-time event with lossless character/attribute old value units.
/// The existing scalar-string event API remains available for UTF-8 consumers.
#[derive(Debug, Clone, PartialEq)]
pub struct Utf16MutationEvent {
    pub event: crate::rtdom::mutations::MutationEvent,
    pub old_value: Option<Vec<u16>>,
    pub attribute_name: Option<Vec<u16>>,
    pub attribute_namespace: Option<Vec<u16>>,
}
impl Tree {
    pub(super) fn character_string(&self, node: Handle) -> Option<&DomString> {
        self.text_ov.get(node).or_else(|| {
            if !self.is_new(node) {
                return None;
            }
            match self.new_ref(node) {
                NewNode::Text(value) | NewNode::CData(value) | NewNode::Comment(value) => {
                    Some(value)
                }
                NewNode::ProcessingInstruction(value) => Some(&value.data),
                _ => None,
            }
        })
    }
    pub(super) fn recorded_character_units(&self, node: Handle) -> Option<Box<[u16]>> {
        if !self.is_recording() {
            return None;
        }
        self.character_string(node)
            .and_then(DomString::unpaired_units)
    }
    pub(super) fn record_old_units(&mut self, units: Option<Box<[u16]>>) {
        if let Some(units) = units {
            if let Some(index) = self
                .mutation_log
                .as_ref()
                .and_then(|events| events.len().checked_sub(1))
            {
                self.mutation_old_units.insert(index, units);
            }
        }
    }
    /// Return exact DOM string code units, including unpaired surrogates.
    #[must_use]
    pub fn node_value_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if let Some(data) = self.native_attribute_data(node) {
            let key = (
                self.attribute_owner(node).unwrap_or(node),
                data.ns.clone(),
                data.local.clone(),
            );
            if let Some(units) = self.attribute_units.get(&key) {
                return Some(units.to_vec());
            }
        }
        self.character_string(node)
            .map(DomString::units)
            .or_else(|| {
                self.node_value(node)
                    .map(|value| value.encode_utf16().collect())
            })
    }
    #[must_use]
    pub fn text_content_utf16(&self, node: Handle) -> Vec<u16> {
        if matches!(
            self.node_type(node),
            NodeType::Attribute
                | NodeType::Text
                | NodeType::CDataSection
                | NodeType::Comment
                | NodeType::ProcessingInstruction
        ) {
            return self.node_value_utf16(node).unwrap_or_default();
        }
        let mut units = Vec::new();
        self.collect_text_units(node, &mut units);
        units
    }
    fn collect_text_units(&self, node: Handle, units: &mut Vec<u16>) {
        let mut pending = self.children(node);
        pending.reverse();
        while let Some(child) = pending.pop() {
            match self.node_type(child) {
                NodeType::Text | NodeType::CDataSection => {
                    units.extend(self.node_value_utf16(child).unwrap_or_default());
                }
                NodeType::Comment | NodeType::Fragment => {}
                _ => {
                    let children = self.children(child);
                    pending.extend(children.into_iter().rev());
                }
            }
        }
    }
    /// Create character data without a scalar-value conversion at the host boundary.
    pub fn create_text_node_utf16(&mut self, units: &[u16]) -> Handle {
        let node = self.push_node(NewNode::Text(DomString::from_units(units)));
        self.bump_unscoped();
        node
    }
    pub fn create_processing_instruction_utf16(&mut self, target: &str, units: &[u16]) -> Handle {
        let node = self.create_processing_instruction(target, &String::from_utf16_lossy(units));
        self.text_ov.insert(node, DomString::from_units(units));
        node
    }
    /// Create an XML CDATA section. DOM bindings reject `]]>` and HTML documents first.
    pub fn create_cdata_section_utf16(&mut self, units: &[u16]) -> Handle {
        let node = self.push_node(NewNode::CData(DomString::from_units(units)));
        self.bump_unscoped();
        node
    }
    pub fn create_comment_utf16(&mut self, units: &[u16]) -> Handle {
        let node = self.push_node(NewNode::Comment(DomString::from_units(units)));
        self.bump_unscoped();
        node
    }
    /// Set character or descendant text while retaining the ordinary mutation path.
    pub fn set_text_content_utf16(&mut self, node: Handle, units: &[u16]) {
        let value = DomString::from_units(units);
        if self.node_type(node) == NodeType::Attribute {
            self.set_attribute_value_utf16(node, units);
            return;
        }
        self.set_text_content(node, &value);
        match self.node_type(node) {
            NodeType::Text
            | NodeType::CDataSection
            | NodeType::Comment
            | NodeType::ProcessingInstruction => {
                self.text_ov.insert(node, value);
            }
            // (attributes returned above)
            _ => {
                if let Some(text) = self.first_child(node) {
                    self.text_ov.insert(text, value);
                }
            }
        }
    }
    pub(super) fn recorded_attribute_units(&self, node: Handle, name: &str) -> Option<Box<[u16]>> {
        if !self.is_recording() {
            return None;
        }
        let data = self
            .native_attributes(node)
            .into_iter()
            .find(|record| record.qualified == name)?;
        self.attribute_units
            .get(&(node, data.ns, data.local))
            .cloned()
    }
    #[must_use]
    pub fn get_attribute_utf16(&self, node: Handle, name: &str) -> Option<Vec<u16>> {
        let data = self
            .native_attributes(node)
            .into_iter()
            .find(|record| record.qualified == name)?;
        Some(self.native_attribute_value(node, &data))
    }
    #[must_use]
    pub fn get_attribute_ns_utf16(
        &self,
        node: Handle,
        namespace: Option<&str>,
        local: &str,
    ) -> Option<Vec<u16>> {
        let data = self.native_attribute_namespaced(node, namespace, local)?;
        Some(self.native_attribute_value(node, &data))
    }
    pub(super) fn native_attribute_value(
        &self,
        node: Handle,
        data: &super::NativeAttribute,
    ) -> Vec<u16> {
        self.attribute_units
            .get(&(node, data.ns.clone(), data.local.clone()))
            .map_or_else(
                || data.value.encode_utf16().collect(),
                |units| units.to_vec(),
            )
    }
    pub fn set_attribute_utf16(&mut self, node: Handle, name: &str, units: &[u16]) {
        self.set_attribute_units(node, &name.encode_utf16().collect::<Vec<_>>(), units);
    }
    pub fn set_attribute_ns_utf16(
        &mut self,
        node: Handle,
        namespace: Option<&str>,
        name: &str,
        units: &[u16],
    ) {
        self.set_attribute_ns(node, namespace, name, &String::from_utf16_lossy(units));
        let local = if namespace.is_some_and(|s| !s.is_empty()) {
            name.split_once(':').map_or(name, |(_, local)| local)
        } else {
            name
        };
        self.retain_attribute_units(node, namespace, local, units);
    }
    fn retain_attribute_units(
        &mut self,
        node: Handle,
        namespace: Option<&str>,
        local: &str,
        units: &[u16],
    ) {
        let key = (
            node,
            namespace.filter(|s| !s.is_empty()).map(Into::into),
            local.into(),
        );
        if String::from_utf16(units).is_err() {
            self.attribute_units.insert(key, units.into());
        } else {
            self.attribute_units.remove(&key);
        }
    }
    pub fn create_attribute_utf16(
        &mut self,
        namespace: Option<&str>,
        name: &str,
        units: &[u16],
    ) -> Handle {
        let node = self.create_attribute(namespace, name, &String::from_utf16_lossy(units));
        self.set_attribute_value_utf16(node, units);
        node
    }
    pub fn set_attribute_value_utf16(&mut self, node: Handle, units: &[u16]) {
        let Some(mut data) = self.native_attribute_data(node).cloned() else {
            return;
        };
        data.legacy.value = String::from_utf16_lossy(units).into();
        if let Some(owner) = self.attribute_owner(node) {
            self.set_native_attribute_record(owner, &data);
            self.retain_native_attribute_value(owner, &data, units);
        } else {
            self.set_attribute_value(node, &String::from_utf16_lossy(units));
            self.retain_native_attribute_value(node, &data, units);
        }
    }
    /// Replace a UTF-16 interval. Callers validate DOM offsets before this primitive.
    pub fn replace_data_utf16(&mut self, node: Handle, offset: usize, count: usize, data: &[u16]) {
        let mut units = self.node_value_utf16(node).unwrap_or_default();
        let offset = offset.min(units.len());
        let end = offset.saturating_add(count).min(units.len());
        units.splice(offset..end, data.iter().copied());
        self.set_text_content_utf16(node, &units);
    }
    #[must_use]
    pub fn substring_data_utf16(&self, node: Handle, offset: usize, count: usize) -> Vec<u16> {
        let units = self.node_value_utf16(node).unwrap_or_default();
        let offset = offset.min(units.len());
        units[offset..offset.saturating_add(count).min(units.len())].to_vec()
    }
    pub fn split_text_utf16(&mut self, node: Handle, offset: usize) -> Handle {
        let units = self.node_value_utf16(node).unwrap_or_default();
        let offset = offset.min(units.len());
        self.set_text_content_utf16(node, &units[..offset]);
        let tail = self.create_text_node_utf16(&units[offset..]);
        if let Some(parent) = self.parent(node) {
            let reference = self.next_sibling(node);
            self.insert_before(parent, tail, reference);
        }
        tail
    }
    /// Drain mutation records and their native lossless old values atomically.
    pub fn take_mutation_events_utf16(&mut self) -> Vec<Utf16MutationEvent> {
        let events = self
            .mutation_log
            .as_mut()
            .map_or_default(std::mem::take);
        let mut units = std::mem::take(&mut self.mutation_old_units);
        let mut names = std::mem::take(&mut self.mutation_name_units);
        events
            .into_iter()
            .enumerate()
            .map(|(index, event)| {
                let old_value = units.remove(&index).map(Vec::from).or_else(|| {
                    event
                        .record
                        .old_value()
                        .map(|value| value.encode_utf16().collect())
                });
                let name = names.remove(&index).unwrap_or_default();
                let attribute_name = name.name.map(Vec::from).or_else(|| {
                    event
                        .record
                        .attribute_name()
                        .map(|value| value.encode_utf16().collect())
                });
                let attribute_namespace = name.namespace.map(Vec::from).or_else(|| {
                    event
                        .attribute_namespace
                        .as_ref()
                        .map(|value| value.encode_utf16().collect())
                });
                Utf16MutationEvent {
                    event,
                    old_value,
                    attribute_name,
                    attribute_namespace,
                }
            })
            .collect()
    }
}

impl PartialEq<str> for DomString {
    fn eq(&self, other: &str) -> bool {
        !matches!(self, Self::Units(_)) && self.as_str() == other
    }
}
impl PartialEq<&str> for DomString {
    fn eq(&self, other: &&str) -> bool {
        self == *other
    }
}

#[cfg(test)]
mod payload_tests {
    use super::*;
    #[test]
    fn ordinary_payload_preserves_compact_layout_and_clone_identity() {
        assert_eq!(
            std::mem::size_of::<DomString>(),
            std::mem::size_of::<SmolStr>()
        );
        for source in [
            "",
            "short",
            "𝄞𝄞𝄞𝄞𝄞",
            "a scalar payload larger than the inline capacity",
        ] {
            let value = DomString::from(source);
            assert_eq!(value.as_str(), source);
            assert_eq!(value.units(), source.encode_utf16().collect::<Vec<_>>());
            assert_eq!(value.clone(), value);
        }
        let units = DomString::from_units(&[0xd800, 65]);
        assert_eq!(units.clone().units(), vec![0xd800, 65]);
        assert_ne!(units, DomString::from("�A"));
    }
    #[test]
    fn debug_shows_lone_units_as_units_and_everything_else_as_text() {
        assert_eq!(
            format!("{:?}", DomString::from_units(&[0xd800, 65])),
            "[55296, 65]"
        );
        assert_eq!(format!("{:?}", DomString::from("short")), "\"short\"");
        let long = "a scalar payload larger than the inline capacity";
        assert_eq!(format!("{:?}", DomString::from(long)), format!("{long:?}"));
        assert_eq!(
            format!("{:?}", DomString::from_units(&[0x61, 0x22])),
            "\"a\\\"\""
        );
    }
}
