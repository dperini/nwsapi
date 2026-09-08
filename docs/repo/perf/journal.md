# Performance journal

This journal records performance hypotheses, measurements, decisions, and correctness constraints for `nwsapi`. Entries are organized by the behavior being optimized. The [compiler design](design.md) explains the implementation, the [benchmark report](benchmarks.md) covers package comparisons, and the [generated memory report](../../../assets/repo/bench/memory-performance.json) summarizes comparisons. The [recorded observations](../../../assets/repo/bench/memory-observations.json) preserve raw samples, runtime versions, and engine hashes.

Follow the [shared performance practices](../../fleet/perf/practices.md) when designing new experiments.

Each entry identifies the measured phase, the result, whether the change was retained, the behavior protected by verification, and any remaining work. Measurements below were recorded on September 8, 2026. Revision pairs identify comparable builds. Percentages from different comparisons must not be added together.

<details>
<summary>Memory measurement contract and commands</summary>

Retained heap is measured after four event-loop turns and explicit garbage collections. Node.js v26.5.0 on macOS arm64 runs 100 engines sharing one `jsdom` document. Each executes 100 distinct `.item:not(.absentN)` selectors. Separate workloads exercise `select` and `match`. Chromium 151.0.7922.34 runs 40 engines against separate native iframe documents, calling both `select` and `first` for 100 distinct `.item[data-id="0"]:not(.absentN) > .label` selectors per engine.

Documents and a warmed shared factory exist before engine construction is measured. These are incremental engine measurements. They exclude process RSS, native browser memory, pre-existing documents, and module-loading costs. Shared factory data is amortized across engines. Results do not predict the footprint of independently loaded scripts or arbitrary selector mixes.

The allocation workload warms 100 matching resolvers, then verifies resolver identity across 100,000 compiler cache hits. Sampling uses a 512-byte interval and includes objects discarded by major and minor GC. Those [V8 inspector options](https://chromedevtools.github.io/devtools-protocol/v8/HeapProfiler/#method-startSampling) expose temporary allocations that a survivor-only profile omits. Sampled bytes estimate allocation over time. They are neither retained heap nor deterministic allocation counts. Three separate samples per build support the reported medians.

```sh
pnpm run build
pnpm run gen:memory
pnpm run check:memory
pnpm run bench:memory-profile --count 100 --queries 100 --output /tmp/selection-heap
pnpm run bench:memory-profile --method match --count 100 --queries 100 --output /tmp/matching-heap
pnpm run bench:memory-browser-profile --count 40 --queries 100 --output /tmp/browser-heap
pnpm run bench:allocation-profile --output /tmp/compiler-allocations
```

`gen:memory` derives the tracked comparison report from `assets/repo/bench/memory-observations.json`. It does not rerun historical experiments. Add new measurements with their workload metadata and source hashes to those observations, regenerate the report, and commit both files. `check:memory` rejects a stale report.

Each profiler accepts `--engine /path/to/baseline.cjs` for a saved generated build. The allocation profiler also accepts `--iterations` and `--interval`. The browser profiler uses the Chromium installation for `@playwright/test`.

Load `.heapsnapshot` and `.heapprofile` files in Chrome DevTools' Memory panel. Compare baseline and instances snapshots for idle overhead, then instances and cached snapshots for plan retention. Inspect retaining paths before identifying a leak. Runtime compilation and bookkeeping can affect aggregate heap deltas, so corroborate them with object categories and repeated measurements. Timing runs must execute separately from profiling.

The tracked benchmark observations preserve historical summaries and timing samples. Full snapshots and one-off timing and churn harnesses were temporary and are not part of that artifact. The committed profilers can generate fresh evidence, but the samples alone cannot reproduce the exact historical timing or churn runs.

</details>

## Size query-plan arrays to their selector lists

**Hypothesis.** Allocating resolver and candidate-token arrays at their known length avoids retaining unused backing capacity for every cached selector.

**Phase and result.** Retained query-plan heap, `966a139` → `f357ec0`:

| Measurement                             |          Before |         After |
| --------------------------------------- | --------------: | ------------: |
| Added heap per cached `select` selector |       757 bytes |     490 bytes |
| Array element backing-storage growth    | 3,085,984 bytes | 511,984 bytes |
| Engines plus populated caches           |         10.49MB |        7.67MB |

The workload retains 100 engines with 100 selectors each. The combined result includes lazy allocation of the older cache generation. The array-only experiment also measured about 490 bytes per selector, supporting the attribution of the plan-storage reduction to array capacity. Aggregate heap varies with compilation and bookkeeping.

**Decision.** Retain exact-length resolver and candidate-token arrays. Cached plans keep code and tokens, without query results or context-bound lookup closures.

**Correctness protected.** Cached selector lists preserve document order, duplicate handling, first-result behavior, and visibility of DOM mutations. Plans remain reusable across contexts.

## Allocate empty caches only when used

**Hypothesis.** Cache generations that contain no entries do not need map objects or backing tables.

**Phase and result.** Idle engine construction. Deferring the older generation reduced measured idle overhead from 29,240 to 27,660 bytes per engine in `966a139` → `f357ec0`. Deferring the first generation as well removed 900 map objects and their empty backing tables, totaling 165,600 bytes across 100 idle engines in the `f357ec0` → `c032788` snapshots.

**Decision.** Retain allocation on first write. Clearing a cache releases both generations, and a later write recreates storage. Capacity, promotion, eviction, and the legacy fallback are preserved.

**Correctness protected.** Generation tests exercise promotion and bounded capacity. Legacy tests cover missing and non-callable `Map` implementations. Configuration changes and subsequent queries exercise cache clearing and reuse.

## Share identifier grammar and use fixed regex literals

**Hypothesis.** Engines can share immutable pattern source data while owning separate regex objects and `lastIndex` state.

**Phase and result.** Idle construction and retained string storage:

| Change and revision pair                                         | Evidence                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Default grammar templates, `f357ec0` → `c032788`                 | String growth across 100 engines fell from 432,072 to 186,472 bytes.                                   |
| Fixed regex literals, `c032788` → `13d8821`                      | Eliminated about 186KB of additional string growth across 100 engines.                                 |
| Fixed regex literals and compiler changes, `c032788` → `13d8821` | Node idle heap fell from 23,065 to 21,122 bytes per engine. Chromium fell from 11,773 to 11,610 bytes. |

The construction changes in `f357ec0` → `c032788`, including cache allocation and lookup-closure removal, reduced Node idle overhead by 17.0% and Chromium idle overhead by 8.5%. The subsequent paired comparison measured 8.4% and 1.4% reductions respectively. Chromium already shared much of the string storage, so its benefit was smaller. These are distinct comparisons, not a cumulative percentage.

**Decision.** Retain shared default identifier templates and literal fixed patterns. Custom operators and combinators build separate grammar and are not accumulated in a module-level cache. Every engine retains independent regex state.

**Correctness protected.** All 31 fixed regex sources and flags matched the generated baseline exactly. Tests cover engines created before and after custom extension registration, configuration changes, escaped identifiers, forgiving validation, and nested calls across engines.

## Reduce matching plans and candidate-lookup allocations

**Hypothesis.** Matching resolver lists benefit from exact-length arrays, and direct candidate lookup makes temporary lookup closures unnecessary.

**Phase and result.** Retained matching plans, `f357ec0` → `c032788`:

| Measurement                            |          Before |         After |
| -------------------------------------- | --------------: | ------------: |
| Added heap per cached `match` selector |       454 bytes |     347 bytes |
| Array element backing-storage growth   | 1,552,880 bytes | 262,624 bytes |

The workload retains 10,000 matching plans. The backing-storage category includes other arrays, but its roughly 1.29MB reduction agrees with eliminating spare capacity in resolver arrays. Removing the obsolete candidate-lookup table also eliminated 28,000 bytes of idle closure storage across 100 engines. No separate total-allocation figure was measured for removing temporary lookup closures.

**Decision.** Retain pre-sized matching arrays and direct candidate lookup for both cold and cached queries. First-result compilation does not fetch candidates. Collection results no longer carry unused context, callback, or lookup-array fields.

**Correctness protected.** Quiet parser rejection must allocate a zero-length resolver list. Using an undefined length created a spurious element and caused matching to throw. The retained implementation handles that case. Tests also cover repeated matching of lists and matching after DOM mutation.

## Remove compiler cache-hit bookkeeping

**Hypothesis.** A cache hit should return its resolver before allocating ancestry records, scratch arrays, or helper-alias bookkeeping. Precomputed flag prefixes should avoid repeated cache-key concatenation.

**Phase and result.** Compiler cache hits, `c032788` → `13d8821`:

| Measurement                          |    Before |    After |
| ------------------------------------ | --------: | -------: |
| Median sampled allocation per call   | 391 bytes | 95 bytes |
| Median time for 100,000 warmed calls |   12.61ms |   8.82ms |

The allocation medians come from three independent samples per build, measuring 100,000 calls across 100 warmed matching selectors. Deferring bookkeeping alone measured about 223 bytes per call. Precomputed prefixes brought the final allocation reduction to 75.8%. Fifteen alternating timing trials measured about 30% faster compiler hits, with ranges of 12.29–14.19ms before and 8.59–10.07ms after. Ordinary cached `select` calls do not necessarily invoke the compiler, so this is not a general query-speed claim.

**Decision.** Retain bookkeeping after a miss and a bounded literal table of flag prefixes. Preserve existing cache-key strings, including fallback behavior for nonstandard mode arguments.

**Correctness protected.** Tests distinguish matching, array selection, item-based selection, callback behavior, and relative anchors. Cached relative resolvers observe changed anchors. The focused verification for `13d8821` passed 263 tests across 10 files, plus Chromium integration, type checking, and targeted lint.

## Verify eviction and document ownership

**Hypothesis.** Bounded plan caches should release evicted resolvers, and collection observers should not keep released engines or detached documents alive.

**Phase and result.** The `c032788` and `13d8821` builds executed 65,536 `select` and `match` calls across 32,768 distinct selectors. At both 16,384 and 32,768 selectors, each of the four observed caches held 4,096 entries. All 100 tracked early matching resolvers were collected after eviction. Clearing the caches returned their sizes to zero.

The candidate retained about 13.16MB above baseline at the first checkpoint and 13.21MB at the second. That is a plateau for this workload, not proof about every selector mix. Heap remaining above baseline after clearing can include runtime overhead.

| Lifecycle scenario                                             | Objects tracked | Objects retained after collection |
| -------------------------------------------------------------- | --------------: | --------------------------------: |
| Node detached subtree, engine returned to live document        |     2,000 nodes |                                 0 |
| Chromium detached subtrees, engines returned to live documents |     4,000 nodes |                                 0 |
| Chromium engine release while documents remain live            |      40 engines |                                 0 |
| Chromium iframe removal and document release                   |    40 documents |                                 0 |

Both compared builds collected all tracked objects after observer delivery and garbage collection. The scenarios cover particular ownership paths. They do not establish collection under every installation mode, event-listener configuration, or application lifecycle.

**Decision.** Preserve current cache capacity and ownership. Do not classify residual aggregate heap as a leak without retaining-path evidence. Prefer the settled profilers over the older synchronous `bench:memory` detached-node delta, which does not isolate observer delivery and window cleanup.

**Follow-up.** Measure application selector reuse before changing cache limits. Investigate engine-local closures and compiled resolvers with explicit ownership tests before attempting shared state. Add lifecycle cases when a concrete retention path or application workload identifies a gap.

## Check full-query timing and construction cost

**Hypothesis.** Lower allocation should preserve complete query behavior and throughput, even when the optimized compiler path is not involved.

**Phase and result.** Isolated timing, `c032788` → `13d8821`:

| Workload                                    | Before median | After median |
| ------------------------------------------- | ------------: | -----------: |
| 30,000 hot `select` calls                   |       45.08ms |      44.71ms |
| 30,000 hot `match` calls                    |        6.65ms |       6.84ms |
| Construct 100 engines, GC before each batch |        0.90ms |       0.58ms |

Query measurements alternate builds over 15 trials, using five matching elements and 100 selector strings. Query timing ranges overlap. The construction control warms both factories and runs GC outside the timer before each of 21 alternating trials. An earlier mixed run measured noisy construction medians of 4.00ms before and 6.46ms after for 500 engines. Cold-query timings were also bimodal.

**Decision.** Retain the measured memory and compiler-allocation improvements. Do not claim a general hot-query speedup, a stable cold-query improvement, or reduced GC pauses. The controlled construction result supports the implementation change, but does not predict end-to-end application latency.
