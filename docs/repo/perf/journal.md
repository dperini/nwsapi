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

## Index filtered siblings once per query

**Hypothesis.** Filtered child positions should inspect each parent's children once during a query. Repeated DOM reads for every candidate would turn a simple sibling filter into repeated full scans. Ordinary typed positions should also reuse known candidate identity and stop early when a first-result query can do so.

<details>
<summary>Positional query measurement contract and command</summary>

The [benchmark script](../../../scripts/repo/bench/filtered-positions.mts) compares `6b87731` with the current source. It transforms both TypeScript files with the same tool and loads them into separate contexts. The shared `jsdom` document contains 500 sibling paragraphs, of which 333 have the `item` class. Document creation happens outside the timers. Construction measurements exclude module loading. Shared query cases verify matching results before timing.

Seven alternating trials measure warmed construction, `select()`, and `first()` calls. The report preserves per-trial samples and source hashes. This run used Node.js 26.5.0, V8 14.6.202.34, and an Apple M3 Max. These are engine calls over `jsdom`, not browser-native or end-to-end application timings.

```sh
node scripts/repo/bench/filtered-positions.mts --baseline 6b87731
```

The script writes [the tracked observations](../../../assets/repo/bench/filtered-positions.json). After timing finishes, it records a separate V8 CPU profile of 2,000 warmed filtered selections. The full profile goes into a directory created with `os.tmpdir()`. The tracked report retains the sample summary. Profiling does not run inside the timing measurements.

</details>

| Phase and selector            | Before median | After median |
| ----------------------------- | ------------: | -----------: |
| Construct an engine           |    0.006383ms |   0.006325ms |
| `select('p')`                 |    0.000237ms |   0.000238ms |
| `select('main > p')`          |     0.02352ms |    0.02323ms |
| `select('p:nth-child(2n)')`   |     0.01921ms |    0.01973ms |
| `select('p:nth-of-type(2n)')` |     0.06543ms |    0.04120ms |
| `first('p:nth-of-type(2n)')`  |     0.06337ms |   0.000568ms |

These cases use one parent with children of the same type. Typed selection took about 37% less time, and the early first-result case took about 99% less time. Ordinary cases stayed close, including a 2.7% increase for the shown `:nth-child()` selection. The large first-result improvement depends on finding a match near the start. It does not predict a similar improvement for late matches or mixed trees.

| Newly supported selector            | `select()` | `first()` |
| ----------------------------------- | ---------: | --------: |
| `p:nth-child(2n of .item)`          |  0.09834ms | 0.06664ms |
| `p:nth-last-child(1 of .item)`      |  0.09714ms | 0.18373ms |
| `p:nth-child(2n of :not([hidden]))` |  0.09700ms | 0.07269ms |

These filtered cases have no before measurement because the baseline did not support them. A reverse-position first-result search still visits candidates until it reaches the qualifying element. The measurements expose that cost instead of assuming that `first()` is always cheaper than `select()`.

**Decision.** Retain one filtered sibling index per parent and filter during each query. Keep indexes out of cached compiled plans. Reuse the index across candidates in a first-result search. Calls with user callbacks use fresh state because a callback can change the tree. Typed sibling matching compares both local name and namespace, then uses candidate identity to avoid repeated property reads on the common ordered path.

**Correctness protected.** Tests cover filtered lists, nesting, forward and reverse positions, detached elements, fragments, XML namespaces, repeated and reordered candidates, DOM changes, and callback exceptions. A read-count test verifies that selection and first-result search each inspect 200 sibling classes once. Positional helpers clear their state in `finally` blocks.

**Profile and limits.** The separate CPU profile collected 146 samples, including 44 in `nthFiltered`, nine in `classOf`, and eight in `nextOf`. Resolver and DOM attribute work also remain visible. This is evidence about CPU work. The experiment does not measure retained heap or GC pauses, and it does not establish a memory reduction for the new indexes.

## Bound malformed-selector validation

**Finding.** The arbitrary-input fuzzer stalled inside regular-expression validation. A native stack sample showed `RegExpMatchFast`, and a debugger pause located the call in `parse()`. The captured input contains 232 UTF-16 code units. It is stored as base64 in [the recorded observations](../../../assets/repo/bench/parser-stall.json), together with build hashes and runtime versions.

**Comparison.** The input exceeded a 3000ms process limit in both the `6b87731` baseline and the initial audit build. Each attempt used a fresh Node process and `jsdom` document. The limit included startup. The live stack evidence identifies a matching stall, rather than treating startup time alone as the cause. This gap predates the current filtered-position and namespace changes.

**Resolution.** A linear scan now rejects mismatched closing tokens and invalid string newlines before regular-expression validation. The captured input returns `SyntaxError` in 0.420ms after engine creation. The process also completes within the same 3000ms limit that the earlier attempts exceeded. The [verification script](../../../scripts/repo/bench/parser-stall.mts) updates the recorded observations, and a unit test runs the input in a separate process with that limit.

Fresh fuzzing passed both targets. The generated-selector target passed in the combined run. The arbitrary-input target passed separately after a detached shared-memory segment from this run was removed. Saved-corpus replay also passed. This verifies the captured case and those runs. It does not establish a runtime bound for every possible selector.

## Share Unicode data while expanding selector coverage

**Implementation.** Unicode 17 directionality uses three selected bidi-class expressions. Rolldown embeds them once outside engine instances. The external entry and its type declaration have matching `.js` and `.d.ts` paths under `src/external/` and `dist/external/`. The fallback reads live DOM state and does not retain text or query results. The same build also adds pseudo-element validation, namespace-sensitive attribute defaults, language matching, and shadow helpers.

**Measured cost.** The [recorded memory report](https://github.com/dperini/nwsapi/blob/83771437fc660727479481a59e5361d71593d7c6/assets/repo/bench/memory-footprint.json) uses 40 native Chromium documents, 100 distinct queries per engine, and five rounds. It follows the existing measurement contract and excludes loaded modules and document allocation.

| Measurement                     | Previous record | Current record |
| ------------------------------- | --------------: | -------------: |
| Idle retained heap per engine   |         9.74KiB |       10.37KiB |
| Retained heap after 100 queries |        73.14KiB |       74.96KiB |
| Minified browser file           |        54.11KiB |       76.23KiB |
| Brotli browser file             |        16.82KiB |       22.95KiB |

Retained heap after the queries is about 2.5% above the previous record. The comparison library, `@asamuzakjp/dom-selector` 8.3.2, retains 550.69KiB in this run. The current core uses about 86.4% less retained heap for this workload. These records describe the combined feature changes, rather than isolate the cost of each helper. The file-size report includes shared Unicode data that the incremental per-engine heap measurement excludes.

**Decision.** Retain the correctness changes and the shared data layout. All 7,445 selected WPT subtests pass in generated source and the minified build. Forced-fallback tests verify Unicode range boundaries, control values, shadow assignments, and DOM changes. The timing charts keep their separately recorded inputs and hashes. This refresh does not claim a new query-speed improvement.

## Reduce compressed size while keeping readable builds

**Implementation.** The core keeps shared Unicode expressions inline and moves older DOM implementations into an optional legacy module. The command-line tool loads the core instead of bundling another copy. Browser output uses ES5 syntax without minification. Selected runtime APIs are captured and checked once when the module loads, then reused by engine instances. The [build design](../build/design.md) describes the output paths and package staging.

<details>
<summary>Build, startup, and memory measurement methods</summary>

The [build comparison](https://github.com/dperini/nwsapi/blob/f7f821ee2fc043b74fe262e0ca76478905b9bfdc/assets/repo/bench/build-compression.json) builds revision `8377143` and the candidate with the same installed dependencies. It normalizes generated dependency region comments in the temporary baseline checkout. File measurements use gzip level 9 and Brotli quality 11. Package measurements use actual tarballs. The candidate is staged under `os.tmpdir()` to preserve the published paths.

Module initialization alternates revisions across seven trials of 32 fresh VM contexts. Script compilation, context creation, and garbage collection happen outside the timer. Contexts remain alive for the heap reading. These measurements cover the shared factory and data before any document or engine is created. They exclude process startup and JavaScript compilation.

The separate [native-browser memory report](../../../assets/repo/bench/memory-footprint.json) uses 40 documents, 100 distinct queries per engine, and five trials. Loaded modules and documents exist before the baseline reading. The comparison below uses the previous recorded run, rather than a paired experiment. It does not isolate the effect of each change.

```sh
pnpm run report:build --baseline 8377143
pnpm run report:size
pnpm run compare:memory
pnpm run gen:bench
```

</details>

| Artifact measurement | Before | After |
| -------------------- | -----: | ----: |
| Readable core | 160,699 bytes | 191,617 bytes |
| Core with gzip | 44,520 bytes | 37,702 bytes |
| Core with Brotli | 36,247 bytes | 30,321 bytes |
| Packed npm package | 123,902 bytes | 58,869 bytes |

The core is 15.3% smaller with gzip and 16.3% smaller with Brotli. Its uncompressed size increases by 19.2%, mainly because the ES5 printer adds indentation and line breaks. The optional legacy module adds 4,653 bytes with gzip or 4,072 bytes with Brotli. Adding those separate transfers still stays below the previous core for either compression format. The package is 52.5% smaller, including the legacy module. That result also reflects removing the duplicated engine and minified artifact.

| Retained heap per engine | Previous record | Current record |
| ----------------------- | --------------: | -------------: |
| Idle | 10.37KiB | 9.11KiB |
| After 100 queries | 74.96KiB | 73.62KiB |

These are incremental JavaScript heap measurements on native Chromium documents. They exclude shared module data, document allocation, and native browser memory. In the same refreshed workload, `@asamuzakjp/dom-selector` 8.3.2 retains 550.30KiB after querying. The core uses about 86.6% less retained heap for these cases. Query timing charts retain their separately recorded inputs and hashes.

**Startup cost.** Median module initialization rises from 0.02583ms to 0.05120ms. Shared retained heap rises from 3.22KiB to 5.25KiB. These costs cover all engines using that loaded module. They must not be added to each engine's heap figure. Native-source checks and small collection probes run during this phase, rather than during every query.

**Decision.** Retain readable output, shared inline expressions, optional legacy hooks, and captured runtime APIs. A [rejected Unicode-packing experiment](../../../assets/repo/bench/unicode-packing.json) saved about 1KiB with Brotli but added about 0.28ms and 11.64KiB to module initialization. The decoder was removed. That report preserves the experiment's observations. The current build script does not reconstruct its discarded implementation.

**Correctness protected.** All 7,445 selected WPT subtests pass in both modern and forced-legacy modes. Unit, integration, browser, and isolated package-install tests pass. Cumulative coverage includes both WPT modes and keeps the existing thresholds. ES5 parsing and compatibility lint cover browser output and generated selector functions. These checks do not execute IE11 itself.

## Format generated JavaScript

**Implementation.** The build runs `oxfmt` after syntax transforms, export annotations, and the license banner. Tabs and a wider line limit reduce whitespace in the readable output. Browser files pass an ES5 parse after formatting. The build keeps inline Unicode expressions and uses no minification.

<details>
<summary>Formatting comparison and commands</summary>

The [generated report](../../../assets/repo/bench/build-compression.json) compares revision `f7f821e` with the formatted build. Both revisions use the same installed dependencies. File measurements use gzip level 9 and Brotli quality 11. The package measurement includes all 12 published files and their current README. Each package is staged under `os.tmpdir()`.

The report also changes one formatter option at a time on the candidate core. It records the settings, formatter version, file hashes, and sizes. These comparisons support the comments in `.config/build.config.mts`. Compression savings from separate options cannot be added together.

```sh
pnpm run report:size
pnpm run gen:bench
pnpm run report:build --baseline f7f821e
```

</details>

| Artifact measurement | Before | After |
| -------------------- | -----: | ----: |
| Readable core | 191,617 bytes | 152,639 bytes |
| Core with gzip | 37,702 bytes | 37,090 bytes |
| Core with Brotli | 30,321 bytes | 30,045 bytes |
| Packed npm package | 58,869 bytes | 57,802 bytes |

The core is 20.3% smaller before compression, 1.6% smaller with gzip, and 0.9% smaller with Brotli. The optional legacy module is 15,560 bytes before compression, 4,439 bytes with gzip, and 3,857 bytes with Brotli. The packed package is 1.8% smaller. These measurements cover the generated files and package contents.

**Settings.** At the same 160-column wrap limit, tabs save 30,271 raw bytes, 934 gzip bytes, and 642 Brotli bytes versus two-space indentation. Those reductions are 16.5%, 2.5%, and 2.1%. Single quotes save 40 gzip bytes and 42 Brotli bytes, with no raw-size change. The report records the other option comparisons separately.

**Initialization.** Median shared module initialization measures 0.04885ms before formatting and 0.05093ms after formatting. Both builds retain 5.25KiB per loaded module. The measurement uses seven alternating trials of 32 fresh VM contexts. Compilation, context creation, and garbage collection stay outside the timer. This does not measure engine construction or query speed.

**Correctness protected.** The coverage provider reads generated CommonJS files as Node executes them. Passing those files through `vite` again inserts semicolons and shifts coverage positions. The shared fleet helper preserves the original source, and focused selector tests cover gaps exposed by the corrected report. Existing coverage thresholds pass. All 7,445 selected WPT subtests pass in each mode, and browser and isolated package-install tests pass.

**Decision.** Keep the formatter settings and the final ES5 check. The query and per-engine memory charts retain their independently recorded inputs. This change updates the file-size measurements and does not claim a new runtime performance improvement.
