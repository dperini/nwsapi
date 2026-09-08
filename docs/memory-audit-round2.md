# Memory audit: second optimization pass

Measured on September 8, 2026. This pass compares `nwsapi` revision `f357ec0`, which already includes the first memory improvements, with the changes described here. It measures retained V8 JavaScript heap and examines allocation stacks and object ownership.

<details>
<summary>Shared measurement method and limits</summary>

Node.js v26.5.0 on macOS arm64 runs 100 engines against one `jsdom` document. Each engine executes 100 distinct `.item:not(.absentN)` selectors. Separate runs exercise `select` and `match`. The matching target exists before the baseline. The document and shared factory are warmed before engine construction is measured.

Chromium 151.0.7922.34 runs 40 engines against 40 native iframe documents. The documents exist before the baseline. Each engine executes both `select` and `first` for 100 distinct `.item[data-id="0"]:not(.absentN) > .label` selectors. All engines use one loaded factory.

Every measurement follows four event-loop turns and explicit garbage collections. V8 snapshots accompany each phase. Allocation sampling uses a 1,024-byte interval. Snapshot node categories provide structural evidence alongside aggregate heap deltas. Runs execute separately, and timing runs do not overlap profiling.

These are warmed, incremental engine measurements. They exclude module-loading costs, pre-existing DOMs, native browser memory, and process RSS. The shared grammar adds one bounded set of templates per loaded factory, which is amortized here. Do not extrapolate the multi-engine savings directly to independently loaded scripts in every frame. Aggregate heap deltas also contain runtime compilation and bookkeeping variation. The paired idle Node measurements varied between runs, so the table uses the final `select` pair consistently for idle overhead.

Baseline generated engine SHA-256: `39c5f1cf3e5c7fc6f2c1c796dbe3554b45cbfa4b926b43d0c3f9c9a7b448c88b`.

Optimized generated engine SHA-256: `2baf7e70f272a3b85bee9f97b7903e92d851082258ad326a0db6c3b55b82d281`.

</details>

## Retained heap results

| Workload                                                    |       Before |        After |                Change |
| ----------------------------------------------------------- | -----------: | -----------: | --------------------: |
| Node idle engine                                            | 27,669 bytes | 22,976 bytes |            17.0% less |
| Node added heap per cached `match` selector                 |    454 bytes |    347 bytes |            23.5% less |
| Node added heap per cached `select` selector                |    492 bytes |    494 bytes | Essentially unchanged |
| Node engines plus `select` caches, 100 × 100                |       7.69MB |       7.24MB |             5.8% less |
| Node engines plus `match` caches, 100 × 100                 |       7.54MB |       5.77MB |            23.5% less |
| Chromium idle engine                                        | 12,873 bytes | 11,773 bytes |             8.5% less |
| Chromium added heap per selector, both `select` and `first` |    692 bytes |    696 bytes | Essentially unchanged |

The Node cases share a small document and isolate engine and plan overhead. The browser case uses separate native documents and exercises a compound selector through two APIs. The small increases in cached `select` and browser heap are under 1%, with unchanged plan backing-storage structure. This pass does not claim a reduction in those cache entries. Browser engine-and-cache growth fell only 0.8% overall because populated caches dominate that workload.

## Changes and evidence

1. **Share default identifier grammar templates.** Engines clone their own regex objects from a single default grammar. This preserves independent `lastIndex` state. Custom operators and combinators build separate templates and are never added to a module-level grammar cache. Node idle snapshot string growth fell from 432,072 bytes to 186,472 bytes across 100 engines. Chromium already shared most of this string storage, explaining its smaller improvement.
2. **Allocate cache maps on first write.** Empty caches hold no maps. Clearing a cache releases both generations, and later writes recreate storage. Across 100 idle engines, 900 map objects and their empty backing tables accounted for 165,600 bytes. Generation limits, promotion, eviction, and the legacy fallback remain intact.
3. **Size matching resolver arrays before filling them.** `match_collect` now allocates its known selector-list length, including zero for quiet parser rejection. Cached-phase array element backing-storage growth fell from 1,552,880 bytes to 262,624 bytes in the matching workload. This category includes other arrays, but its roughly 1.29MB reduction agrees with eliminating spare capacity in 10,000 resolver arrays.
4. **Remove obsolete candidate-lookup closures.** Cold query collection uses the same direct lookup table as cached queries. It no longer builds a lookup-closure array, and first-result compilation skips candidate lookup entirely. The unused compatibility table and unused collection-return fields are gone. Idle closure storage fell by 28,000 bytes across 100 engines. The transient closure and array removals follow directly from the execution path, with no separate byte claim for total allocation churn.

## Ownership audit

Both browser builds released all tracked objects in the tested lifecycle:

| Scenario                                                    | Tracked objects | Retained before | Retained after |
| ----------------------------------------------------------- | --------------: | --------------: | -------------: |
| Removed subtrees, engines returned to live documents        |     4,000 nodes |               0 |              0 |
| Engine references released while iframe documents stay live |      40 engines |               0 |              0 |
| Iframes removed and document references released            |    40 documents |               0 |              0 |

The native profiler checks weak references after observer delivery and garbage collection. It captures snapshots before construction, after queries, after subtree removal, after engine release, and after document release. Node also released all 2,000 tracked detached nodes in both query modes. These results establish collection for these ownership scenarios. They do not cover every installation mode, event-listener configuration, or application lifecycle.

The remaining footprint is concentrated in compiled resolvers, their closure contexts, plan arrays, and engine-local functions. Node's final idle snapshots still contain about 11.08KB of closure storage per engine. Sharing those functions would require a larger state-ownership refactor. Changing cache capacity would trade memory for recompilation. Neither is justified solely by the current profiles, so this pass preserves the existing cache policy.

## Correctness and timing

The focused run passed 258 tests in 14 files. Coverage includes extensions, quiet validation, escaped identifiers, namespaces, forgiving lists, cache generations, legacy map fallback, cached query plans, and first-result paths. Additional assertions check repeated matching of selector lists and matching after DOM mutation. New cross-engine tests verify that custom operators and combinators do not affect engines created before or after registration, including configuration changes and nested calls.

A Chromium integration test passed. The native memory workloads also assert query results. Type checking and targeted lint passed. Generated JavaScript was rebuilt from the canonical TypeScript source.

An isolated timing run alternated the two builds over 15 measured rounds in one process:

| Workload                  | Before median | After median |
| ------------------------- | ------------: | -----------: |
| 30,000 hot `select` calls |       44.67ms |      44.70ms |
| 30,000 hot `match` calls  |        6.67ms |       6.65ms |
| Construct 500 engines     |        7.36ms |       6.43ms |

Query timings use five matching elements and 100 selector strings. Hot `select` ranges were 42.16–47.34ms before and 42.02–45.63ms after. Hot `match` ranges were 6.44–7.38ms and 6.51–7.16ms. These runs show no material hot-query regression. Construction medians improved, but their ranges overlap substantially. Cold-query timings were bimodal from compilation and garbage collection, so no cold-speed improvement is claimed.

## Reproducing the profiles

```sh
pnpm run build
pnpm run bench:memory-profile --count 100 --queries 100 --output /tmp/select-candidate
pnpm run bench:memory-profile --method match --count 100 --queries 100 --output /tmp/match-candidate
pnpm run bench:memory-browser-profile --count 40 --queries 100 --output /tmp/browser-candidate
```

Pass `--engine /path/to/baseline.cjs` to each command to profile a saved generated baseline. The browser command uses the repository's installed Playwright Chromium. Output defaults to a new temporary directory when omitted. Load `.heapsnapshot` and `.heapprofile` files in Chrome DevTools' Memory panel. Compare retained objects between phases and follow retaining paths before interpreting residual heap as a leak.

Local evidence from this pass:

- `/tmp/nwsapi-round2-select-before/` and `/tmp/nwsapi-round2-select-final/`.
- `/tmp/nwsapi-round2-match-before/` and `/tmp/nwsapi-round2-match-final/`.
- `/tmp/nwsapi-round2-native-before/` and `/tmp/nwsapi-round2-native-final/`.
- `/tmp/nwsapi-round2-grammar/` isolates the initial grammar experiment.
- `/tmp/nwsapi-memory-speed-round2-final.json` contains timing samples. The local harness is `.cache/memory-audit/compare-round2.mjs`.

Temporary snapshots and the ignored timing harness are not committed. Summary files record the measured engine hash and runtime version.
