use super::{cascade, CandidateCache, CompiledSelector, PreparedList, SelectorError, Tree};
use lru::LruCache;
use rustc_hash::FxBuildHasher;
use std::borrow::Borrow;
use std::{hash::Hash, rc::Rc};

/// Policy for errors emitted by the configurable selector API.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum SelectorErrorMode {
    /// Return the error to the caller.
    #[default]
    Return,
    /// Ignore the error and produce no result.
    Ignore,
    /// Report the error through the application's Rust logger and produce no result.
    Log,
}

/// Options for the native selector engine.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SelectorConfig {
    /// Maximum retained entries in each compiled-plan cache.
    pub cache_limit: usize,
    /// Estimated byte budget for each compiled-plan cache.
    pub cache_bytes: usize,
    /// Ignore invalid alternatives in forgiving lists in checked selector APIs.
    pub forgiving: bool,
    /// Return duplicate IDs from direct lookups and ID-seeded document queries.
    /// Element-rooted selector queries retain duplicate IDs either way.
    pub ids_dupes: bool,
    /// Use the configured bulk `:has()` routing policy.
    pub route_planner: bool,
    /// Retain NWSAPI's reserved `USR_EVENT` compatibility option.
    /// This flag has no selector-engine behavior.
    pub usr_event: bool,
    /// How configured compilation and explicit error emission handle syntax errors.
    pub error_mode: SelectorErrorMode,
}

impl Default for SelectorConfig {
    fn default() -> Self {
        Self {
            cache_limit: 4096,
            cache_bytes: 4 * 1024 * 1024,
            forgiving: true,
            ids_dupes: true,
            route_planner: true,
            usr_event: true,
            error_mode: SelectorErrorMode::Return,
        }
    }
}

impl SelectorConfig {
    /// Map NWSAPI's `VERBOSITY` and `LOGERRORS` options to native error handling.
    ///
    /// Verbose mode returns syntax errors to the caller. Otherwise, errors are
    /// either sent to the Rust `log` facade or silently suppressed. A host that
    /// needs JavaScript `console.log` output should log at its JS boundary.
    #[must_use]
    pub const fn with_nwsapi_error_options(mut self, verbosity: bool, log_errors: bool) -> Self {
        self.error_mode = if verbosity {
            SelectorErrorMode::Return
        } else if log_errors {
            SelectorErrorMode::Log
        } else {
            SelectorErrorMode::Ignore
        };
        self
    }
}

pub(crate) struct PlanCache<K> {
    entries: LruCache<K, (Rc<PreparedList>, usize), FxBuildHasher>,
    admission: u32,
    bytes: usize,
}

impl<K: Eq + Hash> Default for PlanCache<K> {
    fn default() -> Self {
        Self {
            entries: LruCache::unbounded_with_hasher(FxBuildHasher),
            admission: 0x9e37_79b9,
            bytes: 0,
        }
    }
}

impl<K: Eq + Hash> PlanCache<K> {
    pub(super) fn get<Q>(&mut self, key: &Q) -> Option<Rc<PreparedList>>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        self.entries.get(key).map(|(plan, _)| Rc::clone(plan))
    }

    pub(super) fn retain_plan(
        &mut self,
        config: SelectorConfig,
        key_bytes: usize,
        key: impl FnOnce() -> K,
        plan: &Rc<PreparedList>,
    ) {
        self.insert_plan(config, key_bytes, key, plan, false);
    }

    fn insert_plan(
        &mut self,
        config: SelectorConfig,
        key_bytes: usize,
        key: impl FnOnce() -> K,
        plan: &Rc<PreparedList>,
        replacing: bool,
    ) {
        // Charge the key separately so a short alias cannot hide a large plan.
        let estimate = plan
            .source_bytes
            .saturating_mul(15)
            .saturating_add(key_bytes)
            .saturating_add(256);
        if config.cache_limit == 0 || estimate > config.cache_bytes {
            return;
        }
        if self.entries.len() >= config.cache_limit || estimate > config.cache_bytes - self.bytes {
            // Match the overflow admission sequence used by v3's weighted caches.
            if !replacing {
                self.admission ^= self.admission << 13;
                self.admission ^= self.admission >> 17;
                self.admission ^= self.admission << 5;
                if self.admission & 7 != 0 {
                    return;
                }
            }
            while self.entries.len() >= config.cache_limit
                || estimate > config.cache_bytes - self.bytes
            {
                let (_, (_, weight)) = self
                    .entries
                    .pop_lru()
                    .expect("overflow requires a resident");
                self.bytes -= weight;
            }
        }
        self.entries.put(key(), (plan.clone(), estimate));
        self.bytes += estimate;
    }
}

/// Access to one native adapter resolver cache, bounded by the tree's current options.
pub struct ResolverCache<'a> {
    cache: &'a mut PlanCache<String>,
    config: SelectorConfig,
}

impl ResolverCache<'_> {
    pub fn get(&mut self, key: &str) -> Option<CompiledSelector> {
        self.cache.get(key).map(CompiledSelector)
    }

    #[must_use]
    pub fn has(&self, key: &str) -> bool {
        self.cache.entries.contains(key)
    }

    #[must_use]
    pub fn size(&self) -> usize {
        self.cache.entries.len()
    }

    #[must_use]
    pub fn bytes(&self) -> usize {
        self.cache.bytes
    }

    pub fn clear(&mut self) {
        *self.cache = PlanCache::default();
    }

    pub fn set(&mut self, key: &str, plan: CompiledSelector) -> CompiledSelector {
        let previous = self.cache.entries.pop(key);
        let replacing = previous.is_some();
        if let Some((_, weight)) = previous {
            self.cache.bytes -= weight;
        }
        self.cache.insert_plan(
            self.config,
            key.len(),
            || key.to_owned(),
            &plan.0,
            replacing,
        );
        plan
    }
}

impl Tree {
    /// Compiled single-arm matchers keyed by v3's mode and callback prefix.
    pub fn match_lambdas(&mut self) -> ResolverCache<'_> {
        ResolverCache {
            cache: self.match_lambdas.get_mut(),
            config: self.selector_config,
        }
    }

    /// Compiled selection arms used by the native adapter.
    pub fn select_lambdas(&mut self) -> ResolverCache<'_> {
        ResolverCache {
            cache: self.select_lambdas.get_mut(),
            config: self.selector_config,
        }
    }

    /// Matching plans used by the native adapter's matches and closest operations.
    pub fn match_resolvers(&mut self) -> ResolverCache<'_> {
        ResolverCache {
            cache: self.match_resolvers.get_mut(),
            config: self.selector_config,
        }
    }

    /// Selection plans used by the native adapter's first and all operations.
    pub fn select_resolvers(&mut self) -> ResolverCache<'_> {
        ResolverCache {
            cache: self.select_resolvers.get_mut(),
            config: self.selector_config,
        }
    }

    /// Return current native selector options.
    #[must_use]
    pub fn selector_config(&self) -> SelectorConfig {
        self.selector_config
    }

    /// Apply selector options. Changing selector behavior clears retained caches;
    /// changing only the reserved `usr_event` value preserves compiled plans.
    pub fn configure_selectors(&mut self, config: SelectorConfig) {
        let mut previous_behavior = self.selector_config;
        previous_behavior.usr_event = config.usr_event;
        let behavior_changed = previous_behavior != config;
        if self.selector_config != config {
            self.selector_config = config;
        }
        if behavior_changed {
            self.clear_selector_caches();
        }
    }

    /// Look up a retained match/selection plan without parsing or populating the cache.
    #[must_use]
    pub fn cached_selector(&self, source: &str) -> Option<CompiledSelector> {
        self.parse_cache
            .borrow_mut()
            .get(source)
            .map(CompiledSelector)
    }

    /// Look up a plan by its original UTF-16 code units.
    #[must_use]
    pub fn cached_selector_units(&self, source: &[u16]) -> Option<CompiledSelector> {
        self.units_parse_cache
            .borrow_mut()
            .get(source)
            .map(CompiledSelector)
    }

    /// Drop retained scalar and UTF-16 selector plans. Previously acquired plans remain usable.
    pub fn clear_compiled_selectors(&mut self) {
        *self.parse_cache.get_mut() = PlanCache::default();
        *self.units_parse_cache.get_mut() = PlanCache::default();
    }

    /// Clear this tree's compiled-plan, candidate and result caches.
    pub fn clear_selector_caches(&mut self) {
        self.clear_compiled_selectors();
        self.match_lambdas().clear();
        self.select_lambdas().clear();
        self.match_resolvers().clear();
        self.select_resolvers().clear();
        *self.query_candidates.get_mut() = CandidateCache::default();
        *self.qcache.get_mut() = super::super::tree::QueryCache::default();
    }

    /// Report a selector error using this tree's configured error policy.
    ///
    /// # Errors
    ///
    /// Returns the supplied error when the policy is `SelectorErrorMode::Return`.
    pub fn emit(&self, error: SelectorError) -> Result<(), SelectorError> {
        match self.selector_config.error_mode {
            SelectorErrorMode::Return => Err(error),
            SelectorErrorMode::Ignore => Ok(()),
            SelectorErrorMode::Log => {
                log::warn!(target: "nwsapi", "{error}");
                Ok(())
            }
        }
    }

    /// Compile a selector using the configured error policy.
    ///
    /// Returns an empty option when the policy suppresses a syntax error.
    ///
    /// # Errors
    ///
    /// Returns a syntax error when the policy is `SelectorErrorMode::Return`.
    pub fn compile_configured(
        &self,
        source: &str,
    ) -> Result<Option<CompiledSelector>, SelectorError> {
        match self.compile_selector(source) {
            Ok(plan) => Ok(Some(plan)),
            Err(error) => self.emit(error).map(|()| None),
        }
    }

    pub(super) fn validate_selector(&self, source: &str) -> Result<(), SelectorError> {
        cascade::validate_dom(source, self.selector_config.forgiving)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserved_user_event_option_round_trips_without_changing_queries() {
        let mut tree = Tree::parse("<p id=target></p>");
        let target = tree.query_selector("#target").unwrap();
        assert!(tree.selector_config().usr_event);
        let plan = tree.compile_selector("p").unwrap();
        tree.select_resolvers().set("p", plan);

        tree.configure_selectors(SelectorConfig {
            usr_event: false,
            ..tree.selector_config()
        });

        assert!(!tree.selector_config().usr_event);
        assert_eq!(tree.select_resolvers().size(), 1);
        assert_eq!(&*tree.query_selector_all("p"), &[target]);
    }

    #[test]
    fn growing_existing_plan_evicts_an_older_entry_without_sampling() {
        let mut tree = Tree::parse("<p></p>");
        tree.configure_selectors(SelectorConfig {
            cache_bytes: 600,
            ..SelectorConfig::default()
        });
        let small = tree.compile_selector("p").unwrap();
        let larger = tree.compile_selector(".abcdefgh").unwrap();
        let mut cache = tree.match_resolvers();
        cache.set("a", small.clone());
        cache.set("b", small);
        cache.set("b", larger);
        assert!(!cache.has("a"));
        assert!(cache.has("b"));
    }

    #[test]
    fn oversized_plan_replaces_a_cached_alias_without_retaining_it() {
        let mut tree = Tree::parse("<p></p>");
        tree.configure_selectors(SelectorConfig {
            cache_bytes: 512,
            ..SelectorConfig::default()
        });
        let small = tree.compile_selector("p").unwrap();
        let large = tree
            .compile_selector(&format!(".{}", "x".repeat(128)))
            .unwrap();
        let mut cache = tree.select_resolvers();
        cache.set("q", small);
        assert!(cache.has("q"));
        cache.set("q", large);
        assert_eq!(cache.size(), 0);
        assert_eq!(cache.bytes(), 0);
    }

    #[test]
    fn overflow_admissions_follow_v3_and_evict_the_least_recent_plan() {
        let mut tree = Tree::parse("<p></p>");
        tree.configure_selectors(SelectorConfig {
            cache_limit: 2,
            ..SelectorConfig::default()
        });
        tree.compile_selector(".first").unwrap();
        tree.compile_selector(".second").unwrap();
        tree.compile_selector(".first").unwrap();
        for index in 1..=7 {
            let source = format!(".candidate{index}");
            tree.compile_selector(&source).unwrap();
            assert_eq!(tree.cached_selector(&source).is_some(), index == 7);
        }
        assert!(tree.cached_selector(".first").is_some());
        assert!(tree.cached_selector(".second").is_none());
    }

    #[test]
    fn retained_selectors_remain_executable_after_cache_clear() {
        let mut tree = Tree::parse("<p></p>");
        let units: Vec<_> = "p".encode_utf16().collect();
        assert!(tree.cached_selector("p").is_none());
        tree.compile_selector("p").unwrap();
        assert!(tree.cached_selector_units(&units).is_none());
        tree.compile_selector_units(&units).unwrap();
        let scalar = tree.cached_selector("p").unwrap();
        let utf16 = tree.cached_selector_units(&units).unwrap();
        tree.clear_compiled_selectors();
        assert!(tree.cached_selector("p").is_none());
        assert!(tree.cached_selector_units(&units).is_none());
        assert_eq!(scalar.select(&tree, None).len(), 1);
        assert_eq!(utf16.select(&tree, None), scalar.select(&tree, None));
    }

    #[test]
    fn maps_nwsapi_verbosity_and_logging_options() {
        let base = SelectorConfig::default();
        let mut tree = Tree::parse("<p></p>");
        for (verbosity, log_errors, mode) in [
            (true, true, SelectorErrorMode::Return),
            (true, false, SelectorErrorMode::Return),
            (false, true, SelectorErrorMode::Log),
            (false, false, SelectorErrorMode::Ignore),
        ] {
            let config = base.with_nwsapi_error_options(verbosity, log_errors);
            assert_eq!(config.error_mode, mode);
            tree.configure_selectors(config);
            let result = tree.compile_configured("p >> b");
            if verbosity {
                assert!(result.is_err());
            } else {
                assert!(matches!(result, Ok(None)));
            }
        }
    }

    #[test]
    fn configured_errors_can_be_returned_or_suppressed() {
        let mut tree = Tree::parse("<p></p>");
        let error = SelectorError::EmptyCompound;
        assert_eq!(tree.emit(error.clone()), Err(error));
        assert!(tree.compile_configured("p >> b").is_err());
        let config = SelectorConfig {
            error_mode: SelectorErrorMode::Ignore,
            ..tree.selector_config()
        };
        tree.configure_selectors(config);
        assert!(tree.compile_configured("p >> b").unwrap().is_none());
        assert!(tree.compile_selector("p >> b").is_err());
        assert!(tree
            .compile_configured("p")
            .unwrap()
            .unwrap()
            .exists(&tree, None));
    }

    #[test]
    fn cache_budgets_cover_scalar_and_unit_plans_and_clear_existing_results() {
        let mut tree = Tree::parse("<p class=a></p><p class=b></p>");
        let units: Vec<_> = ".a".encode_utf16().collect();
        let before = tree.query_selector_all(".a");
        tree.query_selector_all_units(&units);
        assert_eq!(tree.parse_cache.get_mut().entries.len(), 1);
        assert_eq!(tree.units_parse_cache.get_mut().entries.len(), 1);

        let mut config = tree.selector_config();
        config.cache_limit = 0;
        tree.configure_selectors(config);
        assert!(tree.qcache.get_mut().map.is_empty());
        assert!(tree.parse_cache.get_mut().entries.is_empty());
        assert!(tree.units_parse_cache.get_mut().entries.is_empty());
        assert_eq!(tree.query_selector_all(".a"), before);
        tree.query_selector_all_units(&units);
        assert!(tree.parse_cache.get_mut().entries.is_empty());
        assert!(tree.units_parse_cache.get_mut().entries.is_empty());

        config.cache_limit = 10;
        config.cache_bytes = 320;
        tree.configure_selectors(config);
        tree.compile_selector(".a").unwrap();
        tree.compile_selector(".b").unwrap();
        assert_eq!(tree.parse_cache.get_mut().entries.len(), 1);
        assert!(tree.parse_cache.get_mut().entries.contains(".a"));
        tree.compile_selector_units(&units).unwrap();
        assert_eq!(tree.units_parse_cache.get_mut().entries.len(), 1);
        tree.clear_selector_caches();
        assert!(tree.units_parse_cache.get_mut().entries.is_empty());
        assert!(tree.parse_cache.get_mut().entries.is_empty());
    }

    #[test]
    fn configuration_controls_checked_forgiveness_duplicate_lookup_and_routing() {
        let mut tree = Tree::parse("<main><p id=x class=a><b class=b></b></p><p id=x></p></main>");
        assert!(tree.compile_selector("main > :is(.a, :unknown)").is_ok());
        assert_eq!(tree.by_id(None, "x").len(), 2);
        tree.set_bulk_has_planner(Some(|_| panic!("disabled planner was called")));
        let config = SelectorConfig {
            forgiving: false,
            ids_dupes: false,
            route_planner: false,
            ..tree.selector_config()
        };
        tree.configure_selectors(config);
        assert!(tree.compile_selector("main > :is(.a, :unknown)").is_err());
        assert!(tree
            .query_selector_all_checked("main > :where(.a, :unknown)")
            .is_err());
        assert!(tree.compile_selector("main > :is(.a, .b)").is_ok());
        assert_eq!(
            tree.by_id(None, "x"),
            [tree.get_element_by_id("x").unwrap()]
        );
        assert_eq!(
            tree.compile_selector(".a:has(> .b)")
                .unwrap()
                .select(&tree, None)
                .len(),
            1
        );
    }

    #[test]
    fn duplicate_id_selector_seeds_follow_document_query_context_and_order() {
        let mut tree =
            Tree::parse("<main><i id=x class=a></i><b id=x class=a></b><i id=y></i></main>");
        let first_x = tree.query_selector("i#x").unwrap();
        let second_x = tree.query_selector("b#x").unwrap();
        let y = tree.query_selector("#y").unwrap();
        let main = tree.query_selector("main").unwrap();
        tree.configure_selectors(SelectorConfig {
            ids_dupes: false,
            ..tree.selector_config()
        });

        assert_eq!(&*tree.query_selector_all("#x"), &[first_x]);
        assert_eq!(&*tree.query_selector_all(".a#x"), &[first_x]);
        assert_eq!(&*tree.query_selector_all("#x.a"), &[first_x, second_x]);
        assert_eq!(&*tree.query_selector_all(":is(#x)"), &[first_x, second_x]);
        assert_eq!(&*tree.query_selector_all("#x, #y"), &[first_x, y]);
        assert_eq!(
            tree.compile_selector(".a#x")
                .unwrap()
                .select(&tree, Some(main)),
            [first_x, second_x]
        );
        let selector_units: Vec<_> = ".a#x".encode_utf16().collect();
        assert_eq!(
            &*tree.query_selector_all_from_units(tree.root(), &selector_units),
            &[first_x]
        );
    }
}

#[cfg(test)]
mod relative_tests {
    use super::*;

    #[test]
    fn relative_plans_distinguish_children_descendants_and_siblings() {
        let tree = Tree::parse("<main><div><i></i></div></main><aside></aside>");
        let main = tree.query_selector("main").unwrap();
        assert!(tree
            .compile_relative_selector("i")
            .unwrap()
            .exists(&tree, main));
        assert!(!tree
            .compile_relative_selector("> i")
            .unwrap()
            .exists(&tree, main));
        assert!(tree
            .compile_relative_selector("+ aside, > i")
            .unwrap()
            .exists(&tree, main));
        assert!(tree.compile_relative_selector("> i,").is_err());
        assert!(tree
            .compile_relative_selector("> i), ::before, :has(i")
            .is_err());
    }
}
