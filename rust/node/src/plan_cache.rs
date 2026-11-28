use rustc_hash::FxHashMap;

type PlanKey = (Vec<u16>, bool, bool, bool, Option<String>, Option<String>);

#[derive(Clone)]
pub(crate) struct PlanOptions {
    pub(crate) grammar: Option<String>,
    pub(crate) jquery_enabled: bool,
    pub(crate) not_equal_operator: bool,
    pub(crate) forgiving: bool,
    pub(crate) custom_operator: Option<String>,
}

/// Node-hosted compiled selector plans, bounded by the engine's configured budgets.
pub(crate) struct PlanCache<V> {
    entries: FxHashMap<PlanKey, Option<V>>,
    bytes: usize,
    limit: usize,
    byte_limit: usize,
}

impl<V> Default for PlanCache<V> {
    fn default() -> Self {
        Self {
            entries: FxHashMap::default(),
            bytes: 0,
            limit: 4096,
            byte_limit: 4 * 1024 * 1024,
        }
    }
}

impl<V: Clone> PlanCache<V> {
    pub(crate) fn get_or_compile(
        &mut self,
        selector: &[u16],
        options: PlanOptions,
        cache_limit: usize,
        cache_bytes: usize,
        compile: impl FnOnce() -> Option<V>,
    ) -> Option<V> {
        if self.limit != cache_limit || self.byte_limit != cache_bytes {
            self.clear();
            self.limit = cache_limit;
            self.byte_limit = cache_bytes;
        }
        let custom_operator_bytes = options
            .custom_operator
            .as_ref()
            .map_or(0, |operator| operator.len().saturating_mul(2));
        let estimate = selector
            .len()
            .saturating_mul(2)
            .saturating_add(options.grammar.as_ref().map_or(0, String::len))
            .saturating_add(custom_operator_bytes)
            .saturating_add(256);
        if selector.len() > 4096 || cache_limit == 0 || estimate > cache_bytes {
            return compile();
        }
        let key = (
            selector.to_vec(),
            options.jquery_enabled,
            options.not_equal_operator,
            options.forgiving,
            options.custom_operator,
            options.grammar,
        );
        if let Some(plan) = self.entries.get(&key) {
            return plan.clone();
        }

        let plan = compile();
        if self.entries.len() >= cache_limit || estimate > cache_bytes - self.bytes {
            self.clear();
        }
        self.entries.insert(key, plan.clone());
        self.bytes += estimate;
        plan
    }

    pub(crate) fn clear(&mut self) {
        self.entries.clear();
        self.bytes = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn compile(
        cache: &mut PlanCache<usize>,
        selector: &str,
        limit: usize,
        bytes: usize,
        compilations: &Cell<usize>,
    ) -> Option<usize> {
        let units: Vec<u16> = selector.encode_utf16().collect();
        cache.get_or_compile(
            &units,
            PlanOptions {
                grammar: None,
                jquery_enabled: false,
                not_equal_operator: false,
                forgiving: true,
                custom_operator: None,
            },
            limit,
            bytes,
            || {
                let next = compilations.get() + 1;
                compilations.set(next);
                Some(next)
            },
        )
    }

    #[test]
    fn cache_budgets_control_retention_and_config_changes_clear_old_plans() {
        let compilations = Cell::new(0);
        let mut cache = PlanCache::default();

        assert_eq!(compile(&mut cache, ".a", 8, 4096, &compilations), Some(1));
        assert_eq!(compile(&mut cache, ".a", 8, 4096, &compilations), Some(1));
        assert_eq!(compilations.get(), 1);

        assert_eq!(compile(&mut cache, ".a", 0, 0, &compilations), Some(2));
        assert_eq!(compile(&mut cache, ".a", 0, 0, &compilations), Some(3));
        assert_eq!(compilations.get(), 3);

        assert_eq!(compile(&mut cache, ".a", 8, 0, &compilations), Some(4));
        assert_eq!(compile(&mut cache, ".a", 8, 0, &compilations), Some(5));
        assert_eq!(compilations.get(), 5);
    }

    #[test]
    fn cache_limit_evicts_old_selector_plans() {
        let compilations = Cell::new(0);
        let mut cache = PlanCache::default();

        assert_eq!(compile(&mut cache, ".a", 1, 4096, &compilations), Some(1));
        assert_eq!(compile(&mut cache, ".b", 1, 4096, &compilations), Some(2));
        assert_eq!(compile(&mut cache, ".a", 1, 4096, &compilations), Some(3));
        assert_eq!(compilations.get(), 3);
    }

    #[test]
    fn explicit_clear_forgets_retained_selector_plans() {
        let compilations = Cell::new(0);
        let mut cache = PlanCache::default();

        assert_eq!(compile(&mut cache, ".a", 8, 4096, &compilations), Some(1));
        cache.clear();
        assert_eq!(compile(&mut cache, ".a", 8, 4096, &compilations), Some(2));
        assert_eq!(compilations.get(), 2);
    }

    #[test]
    fn declarative_operator_mode_is_part_of_the_plan_cache_key() {
        let compilations = Cell::new(0);
        let mut cache = PlanCache::default();
        let selector: Vec<u16> = "[data-score@=\"2\"]".encode_utf16().collect();
        let mut compile_with = |custom_operator: Option<&str>| {
            cache.get_or_compile(
                &selector,
                PlanOptions {
                    grammar: None,
                    jquery_enabled: false,
                    not_equal_operator: false,
                    forgiving: true,
                    custom_operator: custom_operator.map(str::to_owned),
                },
                8,
                4096,
                || {
                    let next = compilations.get() + 1;
                    compilations.set(next);
                    Some(next)
                },
            )
        };

        assert_eq!(compile_with(Some("@==")), Some(1));
        assert_eq!(compile_with(Some("@==")), Some(1));
        assert_eq!(compile_with(Some("@=!")), Some(2));
        assert_eq!(compile_with(None), Some(3));
        assert_eq!(compile_with(Some("@==%=!")), Some(4));
        assert_eq!(compile_with(Some("@==%=!")), Some(4));
        assert_eq!(compilations.get(), 4);
    }

    #[test]
    fn independent_engine_caches_keep_their_budgets_and_entries() {
        let compilations = Cell::new(0);
        let mut engines: FxHashMap<u32, PlanCache<usize>> = FxHashMap::default();

        let first = engines.entry(1).or_default();
        assert_eq!(compile(first, ".shared", 8, 4096, &compilations), Some(1));
        let second = engines.entry(2).or_default();
        assert_eq!(compile(second, ".shared", 8, 4096, &compilations), Some(2));

        // Reconfiguring engine 1 clears only its own cache. Engine 2 retains
        // the compiled plan for the same selector and configuration.
        let first = engines.entry(1).or_default();
        assert_eq!(compile(first, ".shared", 0, 0, &compilations), Some(3));
        let second = engines.entry(2).or_default();
        assert_eq!(compile(second, ".shared", 8, 4096, &compilations), Some(2));
        assert_eq!(compilations.get(), 3);
    }
}
