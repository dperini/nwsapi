//! Build for wasm32-unknown-unknown and generate browser glue with wasm-bindgen --target web.
//! Pass the initialized module to the JavaScript engine’s createWasmInstalledQuery method.

use nwsapi::{
    CompiledSelector, FormProp, HasFeatures, HasRelationship, HasRoute, HostSnapshot,
    SelectorState, Tree, VERSION,
};
use wasm_bindgen::prelude::*;

/// Return the NWSAPI engine version represented by this WebAssembly module.
#[wasm_bindgen]
#[must_use]
pub fn version() -> String {
    VERSION.to_owned()
}

#[wasm_bindgen]
pub struct HostQueryPlan {
    plan: CompiledSelector,
}

#[wasm_bindgen]
#[must_use]
#[allow(clippy::needless_pass_by_value)]
pub fn compile_host_selector(
    selector: &[u16],
    jquery_enabled: bool,
    forgiving: bool,
    not_equal_operator: bool,
    custom_operator: Option<String>,
    operator_grammar: Option<String>,
) -> Option<HostQueryPlan> {
    Tree::parse("")
        .compile_host_selector_units_with_operator_grammar(
            selector,
            jquery_enabled,
            not_equal_operator,
            custom_operator.as_deref(),
            forgiving,
            operator_grammar.as_deref(),
        )
        .map(|plan| HostQueryPlan { plan })
}

/// Compile with an explicit grammar. Its presence signals support to the browser adapter.
#[wasm_bindgen]
#[must_use]
pub fn compile_host_selector_with_operator_grammar(
    selector: &[u16],
    jquery_enabled: bool,
    forgiving: bool,
    not_equal_operator: bool,
    custom_operator: Option<String>,
    operator_grammar: String,
) -> Option<HostQueryPlan> {
    compile_host_selector(
        selector,
        jquery_enabled,
        forgiving,
        not_equal_operator,
        custom_operator,
        Some(operator_grammar),
    )
}

#[wasm_bindgen]
#[derive(Default)]
pub struct BrowserSnapshot {
    snapshot: HostSnapshot,
}

#[wasm_bindgen]
impl BrowserSnapshot {
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(xml_document: bool, quirks_document: Option<bool>) -> Self {
        if xml_document {
            Self {
                snapshot: HostSnapshot::for_xml_document(),
            }
        } else if quirks_document == Some(true) {
            Self {
                snapshot: HostSnapshot::for_quirks_document(),
            }
        } else {
            Self::default()
        }
    }

    /// Configure duplicate-ID handling for document-rooted query plans.
    pub fn set_ids_dupes(&mut self, enabled: bool) {
        self.snapshot.set_ids_dupes(enabled);
    }

    pub fn set_route_planner(&mut self, enabled: bool) {
        self.snapshot.set_route_planner(enabled);
    }

    #[allow(clippy::needless_pass_by_value)]
    pub fn set_route_planner_host(&mut self, host: Option<String>) {
        self.snapshot
            .set_route_planner_host(host.as_deref().and_then(|host| match host {
                "chromium" => Some(nwsapi::HasRoutePlannerHost::Chromium),
                "jsdom" => Some(nwsapi::HasRoutePlannerHost::Jsdom),
                _ => None,
            }));
    }

    // wasm-bindgen decodes optional JavaScript strings into owned Rust strings.
    #[allow(clippy::needless_pass_by_value)]
    pub fn push_node(
        &mut self,
        parent: Option<u32>,
        tag: Option<String>,
        namespace: Option<String>,
        text_child: bool,
        document: bool,
        shadow_root: bool,
    ) -> bool {
        self.snapshot
            .push(
                parent,
                tag.as_deref(),
                namespace.as_deref(),
                text_child,
                document,
                shadow_root,
            )
            .is_some()
    }

    // wasm-bindgen decodes optional typed array arguments into owned buffers.
    #[allow(clippy::needless_pass_by_value)]
    pub fn set_attribute(
        &mut self,
        index: u32,
        namespace: Option<Vec<u16>>,
        name: &[u16],
        value: &[u16],
    ) -> bool {
        self.snapshot
            .set_attribute(index, namespace.as_deref(), name, value)
    }

    pub fn set_form_property(&mut self, index: u32, checked: bool, value: bool) -> bool {
        let prop = if checked {
            FormProp::Checked
        } else {
            FormProp::Selected
        };
        self.snapshot.set_form_property(index, prop, value)
    }

    pub fn set_target(&mut self, index: u32, value: bool) -> bool {
        self.snapshot
            .set_selector_state(index, SelectorState::Target, value)
    }

    pub fn set_has_child(&mut self, index: u32, value: bool) -> bool {
        self.snapshot.set_has_child(index, value)
    }

    pub fn set_has_offset_dimensions(&mut self, index: u32, value: bool) -> bool {
        self.snapshot
            .set_selector_state(index, nwsapi::SelectorState::HasOffsetDimensions, value)
    }

    #[allow(clippy::needless_pass_by_value)] // wasm-bindgen accepts owned vectors across JS.
    pub fn set_host_states(&mut self, index: u32, states: Vec<String>) -> bool {
        self.snapshot.set_host_states(index, &states)
    }

    pub fn set_custom_element_defined(&mut self, index: u32, value: bool) -> bool {
        self.snapshot.set_custom_element_defined(index, value)
    }

    pub fn set_directionality(&mut self, index: u32, direction: &str) -> bool {
        self.snapshot.set_directionality(index, direction)
    }

    #[must_use]
    pub fn query(
        &mut self,
        method: &str,
        plan: &HostQueryPlan,
        index: u32,
        bulk_has_planner: Option<js_sys::Function>,
    ) -> Option<Vec<u32>> {
        if let Some(planner) = bulk_has_planner {
            self.snapshot.set_bulk_has_planner_with(move |features| {
                if !js_planner_is_eligible(features) {
                    return HasRoute::Inverse;
                }
                let result = planner.call5(
                    &wasm_bindgen::JsValue::UNDEFINED,
                    &wasm_bindgen::JsValue::from_f64(f64::from(features.anchors)),
                    &wasm_bindgen::JsValue::from_f64(f64::from(features.witnesses)),
                    &wasm_bindgen::JsValue::from_f64(f64::from(features.attributes)),
                    &wasm_bindgen::JsValue::from_f64(if features.dense_inverse {
                        1.0
                    } else {
                        0.0
                    }),
                    &wasm_bindgen::JsValue::from_f64(
                        f64::from(features.witnesses) / f64::from(features.anchors.max(1)),
                    ),
                );
                if result.is_ok_and(|value| value.as_bool() == Some(true)) {
                    HasRoute::Forward
                } else {
                    HasRoute::Inverse
                }
            });
        } else {
            self.snapshot.set_bulk_has_planner(None);
        }
        self.snapshot.query(method, &plan.plan, index)
    }
}

fn js_planner_is_eligible(features: HasFeatures) -> bool {
    if features.relationship != HasRelationship::Descendant || features.attributes == 0 {
        return false;
    }
    let anchors = u64::from(features.anchors);
    let witnesses = u64::from(features.witnesses);
    witnesses > anchors.saturating_mul(2)
        && (!features.dense_inverse || anchors > 192 || witnesses > anchors.saturating_mul(4))
}
