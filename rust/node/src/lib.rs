//! Optional Node-API boundary for selector queries on host-supplied DOM nodes.

mod plan_cache;

#[cfg(not(test))]
mod binding {
    use super::plan_cache::{PlanCache, PlanOptions};
    use napi::bindgen_prelude::{FnArgs, FunctionRef, Uint16Array, Uint16ArraySlice};
    use napi::Env;
    use napi_derive::napi;
    use nwsapi::{
        CompiledSelector, FormProp, HasFeatures, HasRelationship, HasRoute, HostSnapshot,
        SelectorState, Tree, VERSION,
    };
    use rustc_hash::FxHashMap;
    use std::cell::RefCell;

    type BulkHasPlannerRef = FunctionRef<FnArgs<(f64, f64, f64, f64, f64)>, bool>;

    thread_local! {
        static PLANS: RefCell<FxHashMap<u32, PlanCache<CompiledSelector>>> = RefCell::default();
        static PLAN_ORDER: RefCell<Vec<u32>> = RefCell::default();
    }

    #[napi]
    pub const HOST_OPERATOR_GRAMMAR: bool = true;

    /// Return the NWSAPI engine version represented by this native module.
    #[napi]
    pub fn version() -> String {
        VERSION.to_owned()
    }

    type WrapperArgs<'env> = FnArgs<(napi::Unknown<'env>, napi::Unknown<'env>)>;
    type WrapperProbe<'env> = napi::bindgen_prelude::Function<'env, WrapperArgs<'env>, bool>;
    type WrapperLookup<'env> =
        napi::bindgen_prelude::Function<'env, WrapperArgs<'env>, napi::Unknown<'env>>;

    /// Resolve a jsdom implementation node while preserving an existing wrapper's identity.
    #[napi]
    #[allow(clippy::needless_pass_by_value)] // Node-API supplies scoped function handles by value.
    pub fn wrap_host_node<'env>(
        node: napi::Unknown<'env>,
        utils: napi::Unknown<'env>,
        is_wrapper: WrapperProbe<'env>,
        wrapper_for_impl: WrapperLookup<'env>,
    ) -> napi::Result<napi::Unknown<'env>> {
        if node.get_type()? == napi::ValueType::Object && is_wrapper.call((utils, node).into())? {
            return Ok(node);
        }
        wrapper_for_impl.call((utils, node).into())
    }

    /// Clear host selector plans retained by this Node thread.
    #[napi]
    pub fn clear_plan_cache(cache_id: Option<u32>) {
        PLANS.with_borrow_mut(|plans| {
            if let Some(cache_id) = cache_id {
                plans.remove(&cache_id);
                PLAN_ORDER.with_borrow_mut(|order| order.retain(|&id| id != cache_id));
            } else {
                plans.clear();
                PLAN_ORDER.with_borrow_mut(Vec::clear);
            }
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn host_plan(
        selector: &[u16],
        jquery_enabled: bool,
        not_equal_operator: bool,
        custom_operator: Option<&str>,
        forgiving: bool,
        cache_limit: usize,
        cache_bytes: usize,
        cache_id: Option<u32>,
        grammar: Option<&str>,
    ) -> Option<CompiledSelector> {
        PLANS.with_borrow_mut(|plans| {
            let cache_id = cache_id.unwrap_or(0);
            if plans.len() >= 64 && !plans.contains_key(&cache_id) {
                PLAN_ORDER.with_borrow_mut(|order| {
                    if let Some(evicted) = order.first().copied() {
                        order.remove(0);
                        plans.remove(&evicted);
                    }
                });
            }
            PLAN_ORDER.with_borrow_mut(|order| {
                order.retain(|&id| id != cache_id);
                order.push(cache_id);
            });
            let cache = plans.entry(cache_id).or_default();
            cache.get_or_compile(
                selector,
                PlanOptions {
                    grammar: grammar.map(str::to_owned),
                    jquery_enabled,
                    not_equal_operator,
                    forgiving,
                    custom_operator: custom_operator.map(str::to_owned),
                },
                cache_limit,
                cache_bytes,
                || {
                    Tree::parse("").compile_host_selector_units_with_operator_grammar(
                        selector,
                        jquery_enabled,
                        not_equal_operator,
                        custom_operator,
                        forgiving,
                        grammar,
                    )
                },
            )
        })
    }

    #[napi(object)]
    pub struct HostAttribute {
        pub name: Uint16Array,
        pub value: Uint16Array,
        pub namespace: Option<Uint16Array>,
    }

    #[napi(object)]
    pub struct HostNode {
        pub parent: Option<u32>,
        pub tag: Option<String>,
        pub namespace: Option<String>,
        pub attrs: Option<Vec<HostAttribute>>,
        pub has_text_child: Option<bool>,
        pub document: Option<bool>,
        pub xml_document: Option<bool>,
        pub quirks_document: Option<bool>,
        pub shadow_root: Option<bool>,
        pub checked: Option<bool>,
        pub selected: Option<bool>,
        pub target: Option<bool>,
        pub defined: Option<bool>,
        pub direction_rtl: Option<bool>,
        pub has_child: Option<bool>,
        pub has_offset_dimensions: Option<bool>,
        pub states: Option<Vec<String>>,
    }

    /// Validate a selector under a host-supplied attribute operator grammar.
    #[napi]
    #[allow(clippy::needless_pass_by_value)]
    pub fn supports_host_operator_grammar(
        selector: Uint16ArraySlice<'_>,
        grammar: String,
        jquery: bool,
        forgiving: bool,
        not_equal: bool,
        custom_operator: Option<String>,
    ) -> bool {
        Tree::parse("")
            .compile_host_selector_units_with_operator_grammar(
                &selector,
                jquery,
                not_equal,
                custom_operator.as_deref(),
                forgiving,
                Some(&grammar),
            )
            .is_some()
    }

    /// Check whether a selector can be evaluated on a host snapshot.
    #[allow(clippy::needless_pass_by_value, clippy::too_many_arguments)]
    #[napi]
    pub fn supports_host_selector(
        selector: Uint16ArraySlice<'_>,
        jquery_enabled: Option<bool>,
        forgiving: Option<bool>,
        cache_limit: Option<f64>,
        cache_bytes: Option<f64>,
        not_equal_operator: Option<bool>,
        custom_operator: Option<String>,
        cache_id: Option<u32>,
        grammar: Option<String>,
    ) -> bool {
        host_plan(
            &selector,
            jquery_enabled.unwrap_or(false),
            not_equal_operator.unwrap_or(false),
            custom_operator.as_deref(),
            forgiving.unwrap_or(true),
            cache_limit.map_or(4096, |value| value as usize),
            cache_bytes.map_or(4 * 1024 * 1024, |value| value as usize),
            cache_id,
            grammar.as_deref(),
        )
        .is_some()
    }

    /// Query a preorder DOM snapshot. Returns original row indexes, or no
    /// answer when the snapshot or selector is outside the supported subset.
    // Node-API decodes JavaScript string arguments into owned Rust strings.
    #[allow(clippy::needless_pass_by_value, clippy::too_many_arguments)]
    #[napi]
    pub fn query_host(
        env: Env,
        method: String,
        selector: Uint16ArraySlice<'_>,
        nodes: Vec<HostNode>,
        context: u32,
        jquery_enabled: Option<bool>,
        forgiving: Option<bool>,
        ids_dupes: Option<bool>,
        route_planner: Option<bool>,
        cache_limit: Option<f64>,
        cache_bytes: Option<f64>,
        route_planner_host: Option<String>,
        not_equal_operator: Option<bool>,
        custom_operator: Option<String>,
        cache_id: Option<u32>,
        bulk_has_planner: Option<BulkHasPlannerRef>,
        grammar: Option<String>,
    ) -> Option<Vec<u32>> {
        let plan = host_plan(
            &selector,
            jquery_enabled.unwrap_or(false),
            not_equal_operator.unwrap_or(false),
            custom_operator.as_deref(),
            forgiving.unwrap_or(true),
            cache_limit.map_or(4096, |value| value as usize),
            cache_bytes.map_or(4 * 1024 * 1024, |value| value as usize),
            cache_id,
            grammar.as_deref(),
        )?;
        let mut snapshot = if nodes
            .first()
            .is_some_and(|row| row.xml_document == Some(true))
        {
            HostSnapshot::for_xml_document()
        } else if nodes
            .first()
            .is_some_and(|row| row.quirks_document == Some(true))
        {
            HostSnapshot::for_quirks_document()
        } else {
            HostSnapshot::default()
        };
        snapshot.set_ids_dupes(ids_dupes.unwrap_or(true));
        snapshot.set_route_planner(route_planner.unwrap_or(true));
        snapshot.set_route_planner_host(route_planner_host.and_then(|host| match host.as_str() {
            "chromium" => Some(nwsapi::HasRoutePlannerHost::Chromium),
            "jsdom" => Some(nwsapi::HasRoutePlannerHost::Jsdom),
            _ => None,
        }));
        if let Some(planner) = bulk_has_planner {
            snapshot.set_bulk_has_planner_with(move |features| {
                if !js_planner_is_eligible(features) {
                    return HasRoute::Inverse;
                }
                let dense_value = if features.dense_inverse { 1.0 } else { 0.0 };
                let ratio_value =
                    f64::from(features.witnesses) / f64::from(features.anchors.max(1));
                let should_forward = planner
                    .borrow_back(&env)
                    .and_then(|planner| {
                        planner.call(FnArgs::from((
                            f64::from(features.anchors),
                            f64::from(features.witnesses),
                            f64::from(features.attributes),
                            dense_value,
                            ratio_value,
                        )))
                    })
                    .unwrap_or(false);
                if should_forward {
                    HasRoute::Forward
                } else {
                    HasRoute::Inverse
                }
            });
        }
        for row in nodes {
            let index = snapshot.push(
                row.parent,
                row.tag.as_deref(),
                row.namespace.as_deref(),
                row.has_text_child == Some(true),
                row.document == Some(true),
                row.shadow_root == Some(true),
            )?;
            for attr in row.attrs.unwrap_or_default() {
                if !snapshot.set_attribute(
                    index,
                    attr.namespace.as_deref(),
                    &attr.name,
                    &attr.value,
                ) {
                    return None;
                }
            }
            if let Some(value) = row.checked {
                if !snapshot.set_form_property(index, FormProp::Checked, value) {
                    return None;
                }
            }
            if let Some(value) = row.selected {
                if !snapshot.set_form_property(index, FormProp::Selected, value) {
                    return None;
                }
            }
            if let Some(value) = row.target {
                if !snapshot.set_selector_state(index, SelectorState::Target, value) {
                    return None;
                }
            }
            if let Some(value) = row.defined {
                if !snapshot.set_custom_element_defined(index, value) {
                    return None;
                }
            }
            if let Some(rtl) = row.direction_rtl {
                if !snapshot.set_directionality(index, if rtl { "rtl" } else { "ltr" }) {
                    return None;
                }
            }
            if let Some(value) = row.has_child {
                if !snapshot.set_has_child(index, value) {
                    return None;
                }
            }
            if let Some(value) = row.has_offset_dimensions {
                if !snapshot.set_selector_state(
                    index,
                    nwsapi::SelectorState::HasOffsetDimensions,
                    value,
                ) {
                    return None;
                }
            }
            if let Some(states) = row.states {
                if !snapshot.set_host_states(index, &states) {
                    return None;
                }
            }
        }
        snapshot.query(&method, &plan, context)
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
}
