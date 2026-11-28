//! Native unit-backed element names and namespace metadata.
use super::{DomString, ElementNamespace, Handle, Namespace, NewNode, NodeType, Tree};
impl Tree {
    pub(crate) fn same_element_type(&self, first: Handle, second: Handle) -> bool {
        if self.namespace(first) != self.namespace(second) {
            return false;
        }
        if self.namespace(first) == Namespace::Other
            && self.namespace_uri_utf16(first) != self.namespace_uri_utf16(second)
        {
            return false;
        }
        match (
            self.local_name_scalar(first),
            self.local_name_scalar(second),
        ) {
            (Some(first), Some(second)) => first == second,
            (None, None) => self.local_name_utf16(first) == self.local_name_utf16(second),
            _ => false,
        }
    }

    pub(crate) fn local_name_scalar(&self, node: Handle) -> Option<&str> {
        if self.is_new(node) {
            if let NewNode::Element { name, .. } = self.new_ref(node) {
                return name.unpaired_units().is_none().then(|| name.as_str());
            }
        }
        self.local_name(node)
    }
    pub(crate) fn attribute_is_scalar(&self, node: Handle, name: &str) -> bool {
        !self
            .attribute_units
            .keys()
            .any(|(owner, namespace, local)| *owner == node && namespace.is_none() && local == name)
    }

    pub fn create_element_units(&mut self, tag: &[u16]) -> Handle {
        let tag: Vec<_> = tag
            .iter()
            .map(|&unit| {
                if (65..=90).contains(&unit) {
                    unit + 32
                } else {
                    unit
                }
            })
            .collect();
        self.create_element_ns_units(&tag, Namespace::Html)
    }
    pub fn create_element_ns_units(&mut self, tag: &[u16], namespace: Namespace) -> Handle {
        let node = self.push_node(NewNode::Element {
            name: DomString::from_units(tag),
            ns: namespace,
        });
        self.children_ov.insert(node, super::ChildList::new());
        self.attrs_ov.insert(node, super::AttrList::new());
        self.bump_unscoped();
        node
    }
    pub fn create_element_namespace_units(
        &mut self,
        namespace: Option<&[u16]>,
        qualified: &[u16],
    ) -> Handle {
        let namespace = namespace
            .filter(|units| !units.is_empty())
            .map(DomString::from_units);
        let separator = qualified.iter().position(|&unit| unit == 58);
        let (prefix, local) = separator.map_or((None, qualified), |index| {
            (Some(&qualified[..index]), &qualified[index + 1..])
        });
        let kind = match namespace.as_ref().map(DomString::as_str) {
            Some("http://www.w3.org/1999/xhtml") => Namespace::Html,
            Some("http://www.w3.org/2000/svg") => Namespace::Svg,
            Some("http://www.w3.org/1998/Math/MathML") => Namespace::MathMl,
            _ => Namespace::Other,
        };
        let node = self.create_element_ns_units(local, kind);
        self.element_namespaces.insert(
            node,
            ElementNamespace {
                uri: namespace,
                prefix: prefix.map(DomString::from_units),
                qualified_name: DomString::from_units(qualified),
            },
        );
        node
    }
    #[must_use]
    pub fn local_name_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if let Some(data) = self.attribute_data_units(node) {
            return Some(data.local_name);
        }
        if self.node_type(node) == NodeType::Element && self.is_new(node) {
            if let NewNode::Element { name, .. } = self.new_ref(node) {
                return Some(name.units());
            }
        }
        self.local_name(node)
            .map(|name| name.encode_utf16().collect())
    }
    #[must_use]
    pub fn qualified_name_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if let Some(data) = self.attribute_data_units(node) {
            return Some(data.qualified_name);
        }
        self.element_namespaces
            .get(&node)
            .map(|metadata| metadata.qualified_name.units())
            .or_else(|| self.local_name_utf16(node))
    }
    #[must_use]
    pub fn namespace_uri_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if let Some(data) = self.attribute_data_units(node) {
            return data.namespace;
        }
        if let Some(metadata) = self.element_namespaces.get(&node) {
            return metadata.uri.as_ref().map(DomString::units);
        }
        self.namespace_uri(node)
            .map(|uri| uri.encode_utf16().collect())
    }
    #[must_use]
    pub fn prefix_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        if let Some(data) = self.attribute_data_units(node) {
            return data.prefix;
        }
        // `prefix()` reads exactly these two sources: everything else has no prefix.
        self.element_namespaces
            .get(&node)
            .and_then(|metadata| metadata.prefix.as_ref().map(DomString::units))
    }
    #[must_use]
    pub fn tag_name_utf16(&self, node: Handle) -> Option<Vec<u16>> {
        let mut name = self.qualified_name_utf16(node)?;
        if self.namespace(node) == Namespace::Html {
            for unit in &mut name {
                if (97..=122).contains(unit) {
                    *unit -= 32;
                }
            }
        }
        Some(name)
    }
    /// Exact native name comparison for scalar selector identifiers; lone units
    /// remain distinct from the replacement character produced by CSS parsing.
    #[must_use]
    pub fn local_name_is(&self, node: Handle, name: &str) -> bool {
        if self.node_type(node) == NodeType::Element && self.is_new(node) {
            if let NewNode::Element { name: actual, .. } = self.new_ref(node) {
                return actual == name;
            }
        }
        self.local_name(node) == Some(name)
    }
}
