//! Exact native attribute identities; the existing scalar record remains a view.
use super::{AttributeData, DomString};
#[derive(Clone)]
pub(super) struct NativeAttribute {
    pub(super) legacy: AttributeData,
    pub(super) ns: Option<DomString>,
    pub(super) prefix: Option<DomString>,
    pub(super) local: DomString,
    pub(super) qualified: DomString,
}
impl NativeAttribute {
    pub(super) fn plain(name: DomString, value: smol_str::SmolStr) -> Self {
        let mut legacy = AttributeData::new(None, name.as_str(), "");
        legacy.value = value;
        Self {
            legacy,
            ns: None,
            prefix: None,
            local: name.clone(),
            qualified: name,
        }
    }
    pub(super) fn from_legacy(legacy: AttributeData) -> Self {
        Self {
            ns: legacy
                .namespace
                .as_ref()
                .map(|value| DomString::from(value.as_str())),
            prefix: legacy
                .prefix
                .as_ref()
                .map(|value| DomString::from(value.as_str())),
            local: DomString::from(legacy.local_name.as_str()),
            qualified: DomString::from(legacy.qualified_name.as_str()),
            legacy,
        }
    }
    pub(super) fn from_units(namespace: Option<&[u16]>, qualified: &[u16], value: &str) -> Self {
        let ns = namespace
            .filter(|units| !units.is_empty())
            .map(DomString::from_units);
        let separator = if ns.is_some() {
            qualified.iter().position(|&unit| unit == 58)
        } else {
            None
        };
        let (prefix, local) = separator.map_or((None, qualified), |index| {
            (Some(&qualified[..index]), &qualified[index + 1..])
        });
        let qualified = DomString::from_units(qualified);
        let legacy = AttributeData::new(ns.as_deref(), &qualified, value);
        Self {
            legacy,
            ns,
            prefix: prefix.map(DomString::from_units),
            local: DomString::from_units(local),
            qualified,
        }
    }
    pub(super) fn extra_bytes(&self) -> usize {
        self.ns.as_ref().map_or(0, DomString::extra_bytes)
            + self.prefix.as_ref().map_or(0, DomString::extra_bytes)
            + self.local.extra_bytes()
            + self.qualified.extra_bytes()
    }
}
impl std::ops::Deref for NativeAttribute {
    type Target = AttributeData;
    fn deref(&self) -> &AttributeData {
        &self.legacy
    }
}
/// Lossless namespace, name and value record for native browser consumers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttributeDataUtf16 {
    pub namespace: Option<Vec<u16>>,
    pub prefix: Option<Vec<u16>>,
    pub local_name: Vec<u16>,
    pub qualified_name: Vec<u16>,
    pub value: Vec<u16>,
}

#[derive(Default)]
pub(super) struct NativeMutationNames {
    pub(super) name: Option<Box<[u16]>>,
    pub(super) namespace: Option<Box<[u16]>>,
}
impl NativeMutationNames {
    pub(super) fn bytes(&self) -> usize {
        self.name.as_ref().map_or(0, |units| units.len() * 2)
            + self.namespace.as_ref().map_or(0, |units| units.len() * 2)
    }
}
use super::{Handle, NewNode, Tree};
impl Tree {
    pub(super) fn record_native_attribute_names(&mut self, data: &NativeAttribute) {
        if !self.is_recording() {
            return;
        }
        let name = data.local.unpaired_units();
        let namespace = data.ns.as_ref().and_then(DomString::unpaired_units);
        if name.is_some() || namespace.is_some() {
            let index = self.mutation_log.as_ref().unwrap().len() - 1;
            self.mutation_name_units
                .insert(index, NativeMutationNames { name, namespace });
        }
    }
    fn unit_record(&self, owner: Handle, data: &NativeAttribute) -> AttributeDataUtf16 {
        AttributeDataUtf16 {
            namespace: data.ns.as_ref().map(DomString::units),
            prefix: data.prefix.as_ref().map(DomString::units),
            local_name: data.local.units(),
            qualified_name: data.qualified.units(),
            value: self.native_attribute_value(owner, data),
        }
    }
    #[must_use]
    pub fn attributes_units(&self, owner: Handle) -> Vec<AttributeDataUtf16> {
        self.native_attributes(owner)
            .iter()
            .map(|data| self.unit_record(owner, data))
            .collect()
    }
    #[must_use]
    pub fn attribute_data_units(&self, node: Handle) -> Option<AttributeDataUtf16> {
        let data = self.native_attribute_data(node)?;
        Some(self.unit_record(self.attribute_owner(node).unwrap_or(node), data))
    }
    #[must_use]
    pub fn get_attribute_units(&self, owner: Handle, name: &[u16]) -> Option<Vec<u16>> {
        let data = self
            .native_attributes(owner)
            .into_iter()
            .find(|data| data.qualified.matches_units(name))?;
        Some(self.native_attribute_value(owner, &data))
    }
    #[must_use]
    pub fn get_attribute_ns_units(
        &self,
        owner: Handle,
        namespace: Option<&[u16]>,
        local: &[u16],
    ) -> Option<Vec<u16>> {
        let namespace = namespace
            .filter(|units| !units.is_empty())
            .map(DomString::from_units);
        let data = self
            .native_attributes(owner)
            .into_iter()
            .find(|data| data.ns == namespace && data.local.matches_units(local))?;
        Some(self.native_attribute_value(owner, &data))
    }
    pub fn attribute_node_units(
        &mut self,
        owner: Handle,
        namespace: Option<&[u16]>,
        local: &[u16],
    ) -> Option<Handle> {
        self.attribute_node_key(
            owner,
            namespace
                .filter(|units| !units.is_empty())
                .map(DomString::from_units),
            DomString::from_units(local),
        )
    }
    pub fn create_attribute_units(
        &mut self,
        namespace: Option<&[u16]>,
        qualified: &[u16],
        value: &[u16],
    ) -> Handle {
        let data =
            NativeAttribute::from_units(namespace, qualified, &String::from_utf16_lossy(value));
        let node = self.push_node(NewNode::Attribute {
            data: Box::new(data.clone()),
            owner: None,
        });
        self.retain_native_attribute_value(node, &data, value);
        node
    }
    pub fn set_attribute_ns_units(
        &mut self,
        owner: Handle,
        namespace: Option<&[u16]>,
        qualified: &[u16],
        value: &[u16],
    ) {
        let data =
            NativeAttribute::from_units(namespace, qualified, &String::from_utf16_lossy(value));
        self.set_native_attribute_record(owner, &data);
        self.retain_native_attribute_value(owner, &data, value);
    }
    pub fn set_attribute_units(&mut self, owner: Handle, name: &[u16], value: &[u16]) {
        let name = DomString::from_units(name);
        let old = self
            .native_attributes(owner)
            .into_iter()
            .find(|data| data.qualified == name);
        let old_units = if self.is_recording() {
            old.as_ref().and_then(|data| {
                self.attribute_units
                    .get(&(owner, data.ns.clone(), data.local.clone()))
                    .cloned()
            })
        } else {
            None
        };
        let text = String::from_utf16_lossy(value);
        let styled = old.as_ref().is_some_and(|data| data.ns.is_some())
            || self.attribute_change_is_styled(owner, &name, Some(&text));
        let data = self.ensure_attrs(owner).set_qualified(name, &text);
        self.retain_native_attribute_value(owner, &data, value);
        self.sync_attribute_node(owner, &data);
        self.bump_owner_attribute(owner, &data.local, styled);
        self.record_attributes(
            owner,
            &data.local_name,
            old.map(|data| data.value.to_string()),
            data.namespace.as_deref(),
        );
        self.record_old_units(old_units);
        self.record_native_attribute_names(&data);
    }
    pub fn remove_attribute_ns_units(
        &mut self,
        owner: Handle,
        namespace: Option<&[u16]>,
        local: &[u16],
    ) {
        self.remove_native_attribute_ns(
            owner,
            namespace
                .filter(|units| !units.is_empty())
                .map(DomString::from_units)
                .as_ref(),
            &DomString::from_units(local),
        );
    }
    pub fn remove_attribute_units(&mut self, owner: Handle, name: &[u16]) {
        let Some(data) = self
            .native_attributes(owner)
            .into_iter()
            .find(|data| data.qualified.matches_units(name))
        else {
            return;
        };
        self.remove_native_attribute_ns(owner, data.ns.as_ref(), &data.local);
    }
}
