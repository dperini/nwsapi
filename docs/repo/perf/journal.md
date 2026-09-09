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

## Comment tokens and foreign HTML types

**Correctness.** Comment handling preserves token boundaries, quoted text, and CSS escapes. HTML queries include prefixed and mixed-case foreign elements across selection, first-result lookup, matching, and direct-child `:has()` predicates. XML keeps case-sensitive local names. The Chrome 153 comparison drops from 25 to 16 native-versus-core differences. All nine removed differences concern comments or foreign HTML types.

**Cost.** The refreshed [memory report](../../../assets/repo/bench/memory-footprint.json) measures 9.28KiB per initialized engine and 75.67KiB after 100 queries. The earlier record measured 9.11KiB and 73.62KiB. These are separate runs with the same recorded workload, not an alternating comparison. They exclude documents, shared code, and native browser memory. This is a correctness change with a modest retained-heap cost.

**Lookup strategy.** Ordinary HTML trees retain native tag lookup. A weak cache records whether broader candidates are needed. Mutation records and observer delivery invalidate that classification. XML queries continue to use namespace-aware lookup. Compiled tag predicates keep direct property comparisons for ordinary lowercase HTML names.

**Validation.** Selector regression tests cover the selector-layer examples from all 19 issues listed in jsdom's engine-switch PR. Rendering, event-library selector generation, Range mutation performance, and application feedback are separate concerns. Unit, integration, selected WPT, package-install, and browser comparison checks protect this change. Cumulative coverage retains the existing thresholds.


## Host workload and adapter classification

**Problem.** The adapter supplies a small host object to the engine. Foreign-type classification looked for `MutationObserver` on that object instead of the document window. This disabled classification caching and rescanned the tree during repeated queries. A separate child-chain route performed one scoped lookup per class anchor even when one terminal lookup was equally selective.

**Implementation.** Classification now uses the document window and the shared weak observer helper. The observer marks its state dirty without retaining an engine closure. Child-chain routing compares live terminal and anchor counts before choosing scoped lookups. Both changes preserve synchronous mutation visibility. Public matching and closest queries also use exact scope identity, and language parsing accepts quoted ranges and lists.

<details>
<summary>Host workload methods and reproduction</summary>

The [generated report](../../../assets/repo/bench/jsdom-workload.json) runs a prepared `jsdom` checkout in fresh processes. Five trials alternate engine order. The candidate replaces only the host's selector module. The report records host revision, dependency-lock hash, candidate build hash, runtime, input hashes, samples, and variation. The host lock selects `@asamuzakjp/dom-selector` 9.0.1. The separate source comparison uses version 9.1.1, so those results describe different builds. Shared modules are loaded before timing, and the Range workload runs before the lifecycle cases.

The pinned WPT page runs its unmodified test logic and local resources. The reporter registers completion without creating a visual results page. Every trial asserts 2,808 passing subtests, successful harness completion, and no host errors. Resource interception rejects unlisted resources and external origins. Separate CPU-profile runs keep sampling overhead outside the timing comparison.

Lifecycle measurements use 40 new documents with 100 section/span/input groups each. Construction precedes queries on those documents. The first query and 100 repeated `.row > span` queries have separate timers. Results are checked through the public DOM API. Heap deltas include the complete JavaScript document and host state, unlike the incremental engine-memory chart. Closing documents, releasing the array, yielding to queued cleanup, and collecting garbage precede the final heap reading. Residual process heap is not a direct leak measurement.

Prepare the checkout with its documented dependency installation and generation commands. Supply the pinned WPT files listed in the script, including `dom/common.js` and `resources/testharness.js`. The reviewed WPT revision is `e94af787e39d4161f01f0ef78d933f1103ee32b4`.

```sh
pnpm run build
node scripts/repo/bench/jsdom-workload.mts \
  --host /path/to/prepared/jsdom \
  --wpt /path/to/pinned/wpt \
  --profile /path/in/os-temp/selector-workload
```

</details>

| Median measurement | `@asamuzakjp/dom-selector` 9.0.1 | `nwsapi` candidate |
| --- | ---: | ---: |
| Range page | 2087.67ms | 2135.10ms |
| Construct one document | 3.57ms | 3.90ms |
| First query per document | 1.32ms | 0.74ms |
| Repeated query | 0.0310ms | 0.0315ms |
| Retained heap after queries, per document | 2055.02kB | 1799.71kB |
| Residual heap after close, per document | 36.23kB | 29.83kB |

These values cover the host workloads described above. The Range timing ranges overlap, and their sample standard deviations are about 235ms and 295ms. This run does not establish a Range speedup or a clear regression. Construction samples also overlap. Repeated-query times are close, while first-query medians and queried heap favor the candidate. Separate profiles place selector-related stacks below 2% of sampled Range time for both engines. DOM insertion, live-range bookkeeping, stack creation, and garbage collection account for prominent costs.

The [earlier host measurement](../../../assets/repo/bench/jsdom-workload-before-routing.json) recorded a candidate repeated-query median of 0.2091ms before the routing and observer fixes. The final median is 0.0315ms. These are separate alternating comparisons against the same host baseline, rather than a paired experiment isolating each change. The direct-engine routing experiment did not predict the full host result. Profiling the adapter was necessary to find the disabled classification cache.

**Validation.** The selector-layer reproductions now also run through public DOM APIs. The upstream host API suite passed 579 tests with the adapter substituted. The isolated package suite passed Testing Library consumer lookups and computed-style mutation checks. These results establish the tested integration boundary. They do not imply complete CSS conformance or an upstream adoption decision.

## First-result ID lookups and shadow scopes

Exact ID attributes now use the root ID lookup for first-result queries in modern HTML documents and fragments that provide it. A shadow-root `#id` query uses that root's lookup too. Element-scoped queries preserve subtree filtering, and all-result queries preserve duplicate IDs. Attribute escapes, flags, namespace syntax, and empty values retain the full parser path.

The comparison also exposed a correctness problem. A connected shadow tree is absent from the outer document's ID map. The old fallback could therefore reject an existing shadow ID. The fallback now checks the actual tree root before using a document map to prove absence. Hosts without a root lookup retain the subtree walk.

<details>
<summary>Measurement scope and reproduction</summary>

The baseline is `7960cdd`. The candidate and baseline build hashes, raw samples, and correctness results are in [first-id.json](../../../assets/repo/bench/first-id.json). The script is [first-id.mts](../../../scripts/repo/bench/first-id.mts), with its invocation in the [testing commands](../testing/commands.md#compare-first-result-id-lookups).

Measurements used Node 26.5.0 and `jsdom` 30.0.1 on macOS with an Apple M3 Max. Each root contains 2,000 preceding elements and one target. Seven rounds alternate engine order. Warm batches contain 1,000 queries. Cold batches average 30 fresh engines, with construction outside the timer. The final run had no concurrent test jobs. These are direct-engine timings, not browser or integrated application timings. A baseline that returns the wrong node receives no timing result.

</details>

| Warm query | Baseline | Candidate |
| --- | ---: | ---: |
| Document `[id="target"]` | 385.135µs | 0.309µs |
| Shadow root `[id="target"]` | 1009.643µs | 62.235µs |
| Document `[id="target"]:not(p)` | 294.203µs | 286.047µs |
| Document `.target` | 0.345µs | 0.365µs |
| Element `#missing` | 0.391µs | 0.353µs |
| Shadow root `#missing` | 0.388µs | 61.929µs |

The exact-attribute cases benefit from avoiding a full candidate scan and compiled matcher. The shadow lookup itself still walks the host tree, so it is not a constant-time lookup in this host. Compound and class controls remain close to the baseline. The shadow miss is slower because the old result came from the incorrect outer-document rejection. An existing shadow ID returned no result in the baseline. It now returns the expected node in 63.111µs. Light-DOM misses retain their cheap document-map rejection.

Cold document attribute lookup fell from 1034.713µs to 0.400µs. Cold shadow attribute lookup fell from 1679.122µs to 62.267µs. These measurements exclude engine construction. They do not predict the same gain for every selector or document size.

An initial eligibility check added about 0.11µs to warm document class queries by reading document type before rejecting non-attribute syntax. Rejecting that syntax first removed most of the overhead. The final report includes all controls rather than only the improved selectors.

The readable core grew by 580bytes, including 114bytes after gzip and 98bytes after Brotli. The [size report](../../../assets/repo/bench/file-size.json) and charts use the final build. Regression tests cover duplicate IDs, connected and detached scopes, default contexts, XML, escapes, invalid syntax, mutation callbacks, missing APIs, and forced-legacy execution.

## Complex sibling and descendant queries

The exact complex selector from the PR investigation is `.box:first-child ~ .box:nth-of-type(4n) + .box .block.inner > .content`. The original fixture has five boxes, five outer blocks per box, and five inner blocks per outer block. The comparison also includes wider and deeper trees, text and comment siblings, and the plain descendant control `.box .block.inner > .content`.

Profiles showed repeated preceding-sibling reads in the generated resolver. When a general-sibling combinator follows a compound that requires `:first-child`, only the parent's first element can match. The compiler now reads that element directly and runs the complete existing predicate on it. It clears this condition at other combinator boundaries. This adds no result cache and reads the current tree on every call.

<details>
<summary>Measurement scope and reproduction</summary>

Run [complex-selectors.mts](../../../scripts/repo/bench/complex-selectors.mts) with `--host` pointing to a prepared `jsdom` checkout. The [before report](../../../assets/repo/bench/complex-selectors-before.json) records `nwsapi` at `8792132`. The [after report](../../../assets/repo/bench/complex-selectors.json) records the changed build. Both record engine hashes, the same fixture-script hash, host revision, lock hash, raw trials, and profile summaries. The host is `jsdom` 30.0.1 and its locked comparison engine is `@asamuzakjp/dom-selector` 9.0.1. This is not a comparison against a newer package release.

Each engine and API route runs in five fresh worker processes with rotating order. Direct engine calls and public host calls are separate. Each row checks node identity and order against expected nodes derived from the fixture. Warm batches contain 200 queries after 30 warmups. First invocations are recorded separately. Direct engine construction is outside those timers, while a first host query can initialize its engine lazily. Element-scope measurements follow document-scope queries and are not cold compilation measurements.

Mutation batches remove and restore one matching class. Their timing includes the mutation, cache notification where needed, query, and result-length check. The direct baseline receives its public `clear()` notification, as the host integration does after document changes. The report retains the separate unnotified diagnostic, which exposed stale direct results for the plain descendant query. All notified mutation controls pass. That diagnostic is not a failure of the tested host route.

Separate CPU profiles sample 1,000 wide complex host queries. These are selector workloads through the public DOM API. They do not include rendering or establish a whole-application speedup. The before and after reports are separate runs on Node 26.5.0 and an Apple M3 Max, with no concurrent test jobs during timing.

</details>

| Warm document query | `nwsapi` before | `nwsapi` after | Host baseline after |
| --- | ---: | ---: | ---: |
| Original complex fixture | 122.9µs | 119.2µs | 61.9µs |
| Wide complex fixture | 511.5µs | 259.5µs | 243.7µs |
| Deep complex fixture | 134.5µs | 126.1µs | 51.6µs |
| Mixed-sibling complex fixture | 84.9µs | 69.3µs | 51.8µs |
| Wide plain descendant control | 120.2µs | 119.4µs | 171.0µs |

These values use public `jsdom` queries. The wide fixture has 64 boxes with four content nodes each. The deep and mixed fixtures have 16 boxes with four content nodes each. Deep fixtures add eight ancestors inside each box. The wide complex query improves by about 49%, while the plain control stays close to its previous result. The original and deep complex cases still favor the pinned host baseline. Direct-engine measurements show the same broad gap, so this is not solely adapter overhead.

The wide mutation-and-query case fell from 596.5µs to 350.9µs, about 41% lower. Its pinned host baseline took 279.8µs. The optimization therefore helps after DOM changes too, but does not close that remaining gap.

The operation-count guard checks a 100-element sibling list. It verifies the 99 matching nodes and requires fewer than 200 preceding-sibling reads. The changed build uses 99 reads. Tests also cover compound restrictions, combinator boundaries, logical selectors, fragments, shadow roots, public matching, and callbacks. Public selection callbacks retain their collected-result behavior, and compiled resolver callbacks can still change later matches.

The readable core grows by 413bytes, including 91bytes after gzip and 79bytes after Brotli. The next traversal investigation should focus on repeated ancestor and class checks in the small and deep fixtures. This change does not resolve general `:has()` parsing and result-collection work.

## Adjacent class reads and general `:has()` queries

Adjacent class predicates now share one class-value read. For example, matching `.a.b.c` reads the value once and tests all three classes in the existing right-to-left order. The value is local to that predicate evaluation. SVG handling, escaped identifiers, quirks mode, and later DOM changes keep their existing behavior.

General `:has()` now separates branch compilation from candidate matching. A bounded cache stores compiled relative plans and lookup tokens. It is allocated on first use and discarded when the document or selector configuration changes. Every branch is compiled before an early match can return, so a valid branch cannot hide an invalid later branch. Each branch then uses one compiled loop that stops at its first result. Positional indexes remain shared within that loop and are cleared when it exits. Candidate collections are still fetched for each call. The cache stores no anchors or result collections.

<details>
<summary>Measurement scope and reproduction</summary>

The before engine is `c107cb1`. The [general has report](../../../assets/repo/bench/has.json) records both engine hashes and raw samples. Run [has.mts](../../../scripts/repo/bench/has.mts) with `--baseline` pointing to that separately built engine and `--profile` to collect separate CPU samples. Seven fixtures each contain 20 sections with 20 children per section. Five rounds alternate engine order, with 100 warm queries and 10 fresh-engine first queries per round. First-query timers exclude engine construction. Identity and order checks run outside the timers. These are direct calls in `jsdom` 30.0.1 on Node 26.5.0 and an Apple M3 Max, without concurrent test jobs or rendering.

The [traversal report](../../../assets/repo/bench/complex-selectors-class-reads.json) uses the same fixtures and host contract as the preceding entry. It adds separate CPU profiles for the original and deep fixtures. Its timings and the preceding report are separate runs, not a paired experiment isolating the class change. The host comparison remains pinned to `@asamuzakjp/dom-selector` 9.0.1.

</details>

| Warm `select()` case | Before | After |
| --- | ---: | ---: |
| Many matching descendants | 73.09µs | 10.16µs |
| Last descendant matches | 56.39µs | 36.26µs |
| No descendant matches | 59.14µs | 35.96µs |
| Matching branch followed by a miss | 131.99µs | 10.43µs |
| Adjacent section with matching descendants | 6910.35µs | 3716.00µs |
| Twentieth child matches | 96.01µs | 61.49µs |
| Existing direct-child type shortcut | 4.96µs | 5.20µs |

The many-hit case benefits from both plan reuse and early exit. Late hits and misses still inspect their candidate lists, but avoid repeated parsing and plan construction. The sibling case still searches a broad parent context and remains much more expensive. The direct-child control follows its existing shortcut and stays close to its prior time. These fixtures do not establish a universal `:has()` speedup.

Warm `first()` for the many-hit case fell from 4.27µs to 1.12µs. Its cold first query stayed close, at 196.77µs before and 199.64µs after. Cold all-result selection for the same fixture fell from 322.91µs to 250.02µs. The separate baseline CPU profile sampled parsing and collection work prominently. The candidate profile contains only seven samples over the same query count, so it is too short to rank its remaining costs reliably.

| Warm host traversal | Before | After | Pinned host baseline after |
| --- | ---: | ---: | ---: |
| Original complex fixture | 119.23µs | 122.31µs | 61.49µs |
| Wide complex fixture | 259.47µs | 247.97µs | 233.80µs |
| Deep complex fixture | 126.15µs | 127.11µs | 51.80µs |
| Mixed complex fixture | 69.35µs | 67.73µs | 51.30µs |

These public-host measurements show no reliable improvement in the original or deep fixture. Their profiles still contain repeated resolver, parent-element, and class-access work. Sharing adjacent class reads reduces measured property reads but does not solve repeated ancestor traversal. The small wide and mixed timing differences should not be treated as proof that the remaining traversal gap is closed.

The refreshed [native-memory report](../../../assets/repo/bench/memory-footprint.json) records 9.28KiB after initialization and 75.92KiB after 100 distinct queries per engine. It uses Chromium 151.0.7922.34, 40 retained documents, five alternating rounds, and forced garbage collection. DOM allocation and shared library code are outside the measured increment. Its comparison package is `@asamuzakjp/dom-selector` 8.3.2, separate from the host timing baseline. This existing workload does not use general `:has()` and therefore does not measure the populated new plan cache.

The readable core grows by 1839bytes, including 431bytes after gzip and 363bytes after Brotli. The size and memory charts have been regenerated. Validation passed 662 unit tests, 147 integration tests, and all 141 selected WPT pages in both modern and legacy runs. Accumulated coverage is 98.51% of executable lines and 96.28% of type identifiers. Operation-count tests require one class read for `.a.b.c` and one successful attribute check per anchor in the many-hit fixture.

## Sibling `:has()` scope and cache allocation

Relative branches such as `+ section [data-hit]` now fetch candidates only inside the adjacent sibling. The equivalent `~ section [data-hit]` visits following sibling subtrees and stops at the first match. The full compiled predicate still checks the relationship to the anchor. The original query scope is preserved while only the candidate lookup root changes.

This specialization requires a plain type or universal sibling followed by descendants. Branches with additional sibling syntax, custom combinators, or legacy traversal keep the existing broader lookup. This conservative boundary avoids treating a later sibling as a descendant of the first one.

Internal existence checks can also reuse an observed candidate snapshot. Public lookup APIs still return independent copies. Small collections, unsupported hosts, and legacy paths retain their existing copying behavior. Mutation records invalidate the shared internal snapshot before it is reused.

<details>
<summary>Measurement scope and reproduction</summary>

The baseline is `886765c`. The [timing report](../../../assets/repo/bench/has-sibling.json) records both build hashes, raw samples, and separate profiles. Run [has.mts](../../../scripts/repo/bench/has.mts) with `--baseline` pointing to the separately built baseline and `--profile`. The comparison uses the preceding entry's 20-section, 20-child fixtures, five alternating rounds, 100 warm queries, and 10 first queries on fresh engines per round. Added general-sibling cases place matches in every subtree or only in the last section's last child. Identity and order are checked outside the timers. Measurements used Node 26.5.0 and `jsdom` 30.0.1 on an Apple M3 Max without concurrent test jobs.

The [cache-memory report](../../../assets/repo/bench/has-memory.json) comes from [has-memory.mts](../../../scripts/repo/bench/has-memory.mts). It uses three rotating rounds in fresh Chromium 151.0.7922.34 pages, one retained engine per page, and a 24-child anchor. Four forced garbage collections precede each retained-heap measurement. The stages populate 512 plans, add 8192 distinct plans, add another 8192, remove the anchor, and clear the caches. Weak references check both the removed anchor and one child after crossing task boundaries. Whole-page heap includes library code and DOM, so stage differences are more useful than absolute totals.

Allocation sampling runs separately before cache churn. It covers 10000 warmed existence queries and includes collected objects. Its byte totals are sampling estimates, not exact allocation counts. Neither comparison measures rendering or a whole application.

</details>

| Warm selection | Before | After |
| --- | ---: | ---: |
| Adjacent sibling with matching descendants | 3196.03µs | 14.19µs |
| General sibling with matching descendants | 4640.88µs | 13.53µs |
| General sibling with only a final late match | 597.23µs | 341.53µs |
| Descendant with a late match | 35.51µs | 35.73µs |
| Descendant miss | 34.78µs | 33.66µs |
| Twentieth-child positional control | 58.97µs | 58.58µs |
| Direct-child type control | 5.55µs | 5.26µs |

The early sibling matches avoid looking through unrelated subtrees. The late general-sibling case still visits many following subtrees, so its gain is smaller. Descendant and positional controls stay close to their earlier times. These results apply to the eligible shapes and fixtures. They do not establish the same gain for every relative selector.

| Median memory measurement | Before | After |
| --- | ---: | ---: |
| Estimated allocation across 10000 warm checks | 2.58MB | 1.55MB |
| Retained growth after 512 distinct plans | 1.69MB | 1.70MB |
| Retained growth after saturation | 7.12MB | 7.13MB |
| Further retained growth after 8192 more plans | -0.002MB | -0.003MB |
| Removed anchor or child still reachable | 0 | 0 |

The warm allocation estimate falls by about 40%. The before profile attributes sampled allocation to candidate copying, while the after profile records none under that helper. The retained measurements show a plateau after cache saturation rather than growth with every new selector. The cache is bounded, but thousands of distinct compiled selectors still retain several megabytes. Explicit clearing releases about 6.78MB from the candidate page. Some warmed runtime state remains, so clearing does not return the whole page to its initial byte count. Both removed nodes were collected before clearing in every round.

The ordinary native-memory chart is refreshed separately. It records 9.32KiB after initialization and 75.95KiB after 100 queries. That workload does not populate the general `:has()` cache, so it must not replace the saturated-cache measurement above. The readable core grows by 1099bytes, including 294bytes after gzip and 213bytes after Brotli.

Regression tests cover adjacent and general siblings, chained sibling fallbacks, positional and logical predicates, mutation, and public candidate-array isolation. The full local gate passed 663 unit tests, 148 integration tests, and all 141 selected WPT pages in both modern and legacy runs. Accumulated coverage is 98.52% of executable lines and 96.29% of type identifiers. The [test-performance record](../testing/journal.md#reuse-the-legacy-module-and-close-its-fixtures) explains the fixture cleanup and process-test placement.

## Experiment with query-local ancestor reads

The remaining class-based descendant queries revisit parent elements and class values across candidates. This experiment compares the existing compiled resolver with two alternatives. One stores each visited element's parent and class value in a new weak map for every call. The other creates that map only when the candidate list has at least 16 elements and the first candidate has eight ancestors.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-reads.mts` after building the engine. The [script](../../../scripts/repo/bench/ancestor-reads.mts) writes [ancestor-reads.json](../../../assets/repo/bench/ancestor-reads.json). It transforms known reads in compiled resolvers for fixed selectors. It does not modify the production engine or accept arbitrary selector input.

The report records the engine hash, runtime, fixtures, raw samples, and operation counts. Measurements use Node 26.5.0 and `jsdom` fixtures on macOS arm64. Seven rounds rotate the three variants. Each variant receives 30 warmups and 300 calls per timed batch. Candidate lookup and compilation are outside the timers. Parent and class counters run separately. Node identity, order, and results after a class mutation are checked outside the timers.

These are compiled-resolver measurements. They are not public-host timings and cannot be compared directly with the earlier host tables. The experiment does not measure allocation or retained memory. The candidate-count and depth thresholds are experimental choices, not established policy.

</details>

| Warm compiled resolver | Existing | Always cache | Depth gate |
| --- | ---: | ---: | ---: |
| Original complex fixture | 88.95µs | 73.20µs | 86.97µs |
| Original plain control | 47.33µs | 54.07µs | 48.31µs |
| Wide complex fixture | 204.54µs | 193.49µs | 201.28µs |
| Wide plain control | 105.97µs | 139.73µs | 104.78µs |
| Deep complex fixture | 130.73µs | 90.29µs | 96.26µs |
| Deep plain control | 101.90µs | 73.91µs | 80.02µs |

The original fixture has 125 content candidates, the wide fixture has 256, and the deep fixture has 64. The deep tree adds eight wrapper ancestors inside each box. Always-on caching improves the deep complex fixture by about 31%, but slows the wide plain control by about 32%. Fewer DOM reads do not guarantee a faster query because the map and records also require work.

The deep complex resolver performs 860 parent reads and 896 class reads before the change. Always-on caching reduces each count to 306. The depth gate performs 314 parent reads and 306 class reads, including its depth probe. It skips the map in shallow fixtures and stays close to their baseline timings in this run. The original plain control still incurs a small overhead.

No production change was retained from this experiment. The depth gate merits further investigation, but it samples only the first candidate and does not establish a general rule for mixed-depth trees. Before adoption, compare public-host timing, allocation, retained memory, mutation callbacks, missing APIs, legacy behavior, and mixed depths. Reducing repeated prefix matching remains a separate option that could avoid allocating a record for every visited element.

## Validate the ancestor-read depth gate

The browser follow-up does not support adding the depth gate to the production engine. The earlier 26% gain came from a compiled-resolver experiment using `jsdom`. Native DOM measurements show slower deep queries and more allocation with the same approach.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-reads.mts --output assets/repo/bench/ancestor-reads-mixed.json` for the expanded `jsdom` experiment. Run `node scripts/repo/bench/ancestor-browser.mts` for browser timing, allocation sampling, retained heap, and detached-node checks. The reports are [ancestor-reads-mixed.json](../../../assets/repo/bench/ancestor-reads-mixed.json) and [ancestor-browser.json](../../../assets/repo/bench/ancestor-browser.json).

The browser run used Chromium 151.0.7922.34 on macOS arm64. Each fixture has 16 boxes and 64 content candidates. Deep boxes add eight wrapper ancestors. Mixed fixtures alternate shallow and deep boxes. Each selector and fixture gets a fresh page. Seven rounds rotate the three variants, with 100 warmups and 1000 calls per timed batch. The table reports median time per call. Compilation and candidate lookup are outside the timers.

Allocation sampling covers 2000 calls per variant and includes objects collected during sampling. Allocation measurements use a fixed variant order and a 1024byte sampling interval. Four garbage collections precede each whole-page retained-heap reading. These estimates are separate from timing and do not establish a retained-memory limit. Mutation and reversed candidate-order checks run outside timers. Two weak references check whether a removed candidate and its parent remain reachable.

</details>

| Browser compiled resolver | Existing | Always cache | Depth gate |
| --- | ---: | ---: | ---: |
| Shallow complex | 14.1µs | 18.7µs | 14.2µs |
| Shallow plain | 9.4µs | 13.7µs | 9.7µs |
| Deep complex | 32.7µs | 34.1µs | 35.0µs |
| Deep plain | 20.6µs | 26.3µs | 26.6µs |
| Mixed shallow-first complex | 25.0µs | 26.3µs | 25.0µs |
| Mixed shallow-first plain | 15.3µs | 19.9µs | 15.1µs |
| Mixed deep-first complex | 24.1µs | 25.7µs | 25.7µs |
| Mixed deep-first plain | 15.1µs | 19.5µs | 19.7µs |

The complex selector combines sibling positions with descendant classes. The plain control only uses descendant classes and a child relationship. Both use preselected candidates. In the deep browser fixture, the gate slows the complex resolver by about 7% and the plain resolver by about 29%. A shallow first candidate skips caching for the entire mixed tree. A deep first candidate enables it, including for shallow candidates. Reversing candidate order preserves results, but the gate still bases its decision on a single candidate.

Across 2000 deep queries, sampled allocation rises from 46.99MB to 76.17MB for the complex selector and from 41.01MB to 70.27MB for the plain selector. Those increases are about 62% and 71%. The weak map and per-element records add work even when they reduce DOM reads. All result, mutation, and reversed-order checks pass. Both removed nodes become collectible in every fixture. This rules out retention of those two sampled nodes in this workload, not every possible retention problem.

No engine change is retained. Public-host integration and callback compatibility were not tested because the browser timing and allocation regressions already reject this candidate as a general optimization. Reducing repeated prefix matching remains a separate avenue to investigate without a per-element read cache.

## Profile ancestor-read caching in Node

The Node memory experiment compares the existing compiled resolver, always-on caching, and the depth gate using `jsdom`. It measures temporary allocation separately from memory remaining after garbage collection.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-reads.mts --memory --output assets/repo/bench/ancestor-node-memory.json`. The [report](../../../assets/repo/bench/ancestor-node-memory.json) records runtime details, engine hash, raw measurements, and the ten largest sampled allocation sites per sample. The [profiling helper](../../../scripts/repo/bench/ancestor-memory.mts) uses the Node inspector rather than inferring allocation from heap growth.

Three rounds rotate variant order. Each retained-memory measurement brackets two separate batches of 2000 warm queries. Four garbage collections across event-loop turns precede each whole-process heap reading. A separate batch of 2000 queries uses allocation sampling at a 1024byte interval and includes collected objects. Candidate lookup, compilation, result checks, and getter instrumentation are outside allocation sampling. Fixtures and engine instances remain alive during these measurements.

Whole-process heap readings include the profiler and accumulated report data. Small changes are not evidence of a leak or a precise per-query retained cost. This experiment does not measure peak memory, detached-node collection, or queries through the public `jsdom` APIs. Allocation estimates describe total allocation over a batch, not memory needed at one instant.

</details>

| Node allocation across 2000 queries | Existing | Depth gate | Change |
| --- | ---: | ---: | ---: |
| Deep complex | 187.27MB | 207.32MB | +10.7% |
| Deep plain | 145.39MB | 173.04MB | +19.0% |
| Mixed shallow first complex | 142.46MB | 142.34MB | -0.1% |
| Mixed shallow first plain | 99.44MB | 99.60MB | +0.2% |
| Mixed deep first complex | 142.16MB | 169.65MB | +19.3% |
| Mixed deep first plain | 99.71MB | 135.15MB | +35.5% |

These are median sampled allocations across three rounds on Node 26.5.0 with `jsdom` 30.0.1. Deep and mixed fixtures contain 64 candidates. The complex selector combines sibling positions with descendant classes. The plain selector uses descendant classes and a child relationship. The depth gate increases allocation by about 11% and 19% in the deep cases. It skips the cache when the mixed tree starts shallow. With a deep first candidate, mixed-case allocation rises by about 19% and 36%.

The allocation sites help explain the tradeoff. In the first deep plain sample, allocation attributed to the `className` getter falls from 49.17MB to 19.11MB. Allocation attributed to the generated resolver rises from 96.16MB to 119.16MB, and map insertion adds another 33.04MB. V8 can attribute inlined helper allocations to their caller, so these sites do not identify every object type separately.

The deep plain gate has zero measured post-GC growth in both retained batches in all three rounds. For the deep complex gate, the first batch changes the heap by 0bytes to 1392bytes, and the repeated batch changes it by -1240bytes to 5776bytes. This workload does not show retention proportional to total allocated bytes. These short batches do not establish a general absence of leaks, and the fixtures remain attached throughout.

Node therefore presents a tradeoff: the earlier unprofiled deep queries were about 27% and 21% faster, while this allocation experiment shows more temporary allocation. Neither the Node timing gain nor these heap readings justify adopting the gate without public-host and longer-running garbage-collection measurements. The browser regressions remain a separate reason not to enable it generally. Production `nwsapi` is unchanged.

## Reduce the ancestor cache payload

The original cache creates a `{ parent, cls }` record for each visited element. A cache miss reads both properties, even if the resolver only needs one. The smaller experiment stores the class value directly in the weak map and leaves parent reads unchanged. This removes the per-element record and avoids eagerly reading classes for elements visited only to find a parent.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-browser.mts --classes --output assets/repo/bench/ancestor-browser-classes.json` and `node scripts/repo/bench/ancestor-reads.mts --classes --memory --output assets/repo/bench/ancestor-node-classes.json`. The reports are [ancestor-browser-classes.json](../../../assets/repo/bench/ancestor-browser-classes.json) and [ancestor-node-classes.json](../../../assets/repo/bench/ancestor-node-classes.json).

These runs use the same fixture shapes and measurement methods described above. Each report includes its own unchanged-engine baseline. Timing excludes compilation and candidate lookup. Allocation sampling covers 2000 calls. Browser timing has seven rotating rounds, and Node allocation has three rotating rounds. Comparisons with the earlier record cache come from separate runs rather than a single paired experiment. Treat those comparisons as exploratory. All measurements still concern experimental compiled resolvers, not the public host APIs.

</details>

The different DOM implementations help explain the browser and Node results. In the installed `jsdom` 30.0.1 source, the generated `className` getter validates its receiver, starts custom-element reactions, reads the attribute, and ends reactions. The reaction helper pushes a new empty queue. The Node allocation profile attributes substantial allocation to this getter, so avoiding repeated calls can save work. The browser profile measures a different balance between direct reads and cache maintenance.

Every cache hit still adds a helper call, a weak-map lookup, and, for the gated version, a conditional branch. Misses also insert an entry. The browser regressions show that the saved reads do not repay that work in these fixtures. This is an explanation supported by source inspection and allocation measurements, not a CPU-profile attribution of the slowdown to a single operation. Less allocation alone does not guarantee less runtime.

| Class-value gate | Existing allocation | Gate allocation | Allocation change | Time change |
| --- | ---: | ---: | ---: | ---: |
| Node deep complex | 187.64MB | 183.01MB | -2.5% | +7.9% |
| Node deep plain | 145.25MB | 148.58MB | +2.3% | +13.9% |
| Browser deep complex | 46.62MB | 63.57MB | +36.4% | +22.9% |
| Browser deep plain | 41.42MB | 58.14MB | +40.4% | +36.5% |

The allocation columns cover 2000 compiled queries. Positive time changes mean slower queries. Node timings come from a separate fresh process with no inspector profiling, recorded in [ancestor-node-classes-timing.json](../../../assets/repo/bench/ancestor-node-classes-timing.json). Reproduce it with `node scripts/repo/bench/ancestor-reads.mts --classes --output assets/repo/bench/ancestor-node-classes-timing.json`. Timing fields in a Node memory report can be affected by profiler activity from earlier fixtures, so use the separate timing report for this comparison. Browser timers run before profiling on each fresh page.

Compared with the earlier record-cache runs, storing class values directly reduces deep-case allocation by roughly 12–14% in Node and 17% in the browser. It brings Node allocation close to baseline, but loses the earlier timing advantage. The class-value gate performs 868 parent reads in the deep complex fixture, compared with 314 for the record gate. Class reads remain at 306. The smaller representation saves record allocations but gives up most of the saved parent reads.

Correctness and mutation checks pass in both environments. Browser reversed-order checks pass, and both sampled detached nodes become collectible in every fixture. No production change is retained. A better next experiment would cache a repeated selector-prefix result rather than every raw read. That could avoid repeated matching and traversal together, but still needs measurement and callback-mutation checks. Reusing a mutable cache across queries would add invalidation and retention risks, so it is not an automatic remedy for allocation cost.

## Cache repeated ancestor-prefix results

The raw-read caches remain experiments. The record cache adds allocation, while the class-only cache gives up too many parent-read savings. Neither change is adopted. The next experiment stores a boolean result for a repeated ancestor-prefix search instead of storing individual property values.

The fixed selector is split before `.block.inner > .content`. One compiled matcher checks that suffix. Another checks the prefix at each ancestor above the candidate's parent. The cached variant stores whether a matching prefix exists at or above each visited ancestor. A reusable path array lets it fill in that result for the traversed path, including misses. The map and path array belong to one query. No depth probe or first-candidate decision is involved.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-reads.mts --prefix --output assets/repo/bench/ancestor-prefix-timing.json` for unprofiled Node timing. Add `--memory` and use `assets/repo/bench/ancestor-prefix-memory.json` for separate Node allocation and retained-memory measurements. Run `node scripts/repo/bench/ancestor-browser.mts --prefix --output assets/repo/bench/ancestor-prefix-browser.json` for the browser comparison.

The same fixture shapes and measurement methods apply. The three variants are the unchanged compiled resolver, the split prefix matcher without caching, and the split prefix matcher with cached results. The uncached split control distinguishes the cost of splitting the matcher from the effect of caching. Node timing uses a fresh process without allocation profiling. Each allocation sample covers 2000 calls. The helper is in [ancestor-prefix.mts](../../../scripts/repo/bench/ancestor-prefix.mts).

This is a fixed-selector benchmark, not a general compiler transformation. It does not support callbacks or establish behavior for every selector, legacy environment, or public host query. Mutation checks cover both suffix and prefix classes between calls, and reversed candidates check result order. The browser also checks collection of a detached candidate and parent.

</details>

| Prefix-cache timing | Existing | Cached prefix | Change |
| --- | ---: | ---: | ---: |
| Node wide complex | 196.60µs | 342.03µs | +74.0% |
| Node wide plain | 105.71µs | 112.79µs | +6.7% |
| Node deep complex | 130.26µs | 91.49µs | -29.8% |
| Node deep plain | 96.75µs | 64.00µs | -33.8% |
| Browser shallow complex | 13.80µs | 16.90µs | +22.5% |
| Browser shallow plain | 8.50µs | 11.00µs | +29.4% |
| Browser deep complex | 31.90µs | 29.50µs | -7.5% |
| Browser deep plain | 20.40µs | 17.60µs | -13.7% |

These are median times for precompiled resolvers over preselected candidates. Deep cases have 64 candidates beneath eight extra wrappers. The wide Node case has 256 candidates across 64 boxes. The shallow browser case has 64 candidates. Negative changes mean faster queries. The complex selector includes sibling positions, while the plain control uses descendant classes and a child relationship. Both mixed-depth orders improve in these runs, without choosing a caching policy from the first candidate.

The wide complex regression exposes a limitation of this prototype. Splitting the prefix uses the engine's single-element matcher, whose positional check scans siblings independently. The unchanged collection resolver shares positional state across candidates. Caching the ancestor result cuts repeated prefix calls but does not recover that shared positional work. The uncached split control is even slower, so splitting alone is not an optimization.

| Allocation across 2000 queries | Existing | Cached prefix | Change |
| --- | ---: | ---: | ---: |
| Node wide complex | 391.29MB | 638.46MB | +63.2% |
| Node wide plain | 223.24MB | 239.30MB | +7.2% |
| Node deep complex | 186.83MB | 133.06MB | -28.8% |
| Node deep plain | 144.90MB | 106.18MB | -26.7% |
| Browser shallow complex | 22.41MB | 21.31MB | -4.9% |
| Browser shallow plain | 16.48MB | 21.95MB | +33.2% |
| Browser deep complex | 46.84MB | 39.96MB | -14.7% |
| Browser deep plain | 40.84MB | 40.40MB | -1.1% |

These are sampled allocations, including objects collected during the batch. Node values are medians across three rotating rounds. Browser values come from one allocation sample per variant on a fresh fixture page. The deep Node cases allocate about 27–29% less, and both mixed-depth orders allocate about 21–26% less. The wide positional case instead allocates 63% more. The browser deep complex case allocates about 15% less, while the deep plain case stays close to baseline. Shallow browser queries still expose cache overhead.

Both retained batches show zero measured heap growth for the cached deep Node cases in all three rounds. This is a short whole-process measurement with attached fixtures, not proof that every use is leak-free. The browser's detached-node checks pass. Result identity, suffix mutation, prefix mutation, and reversed candidate-order checks also pass. Lint and type checks pass.

The records are [Node timing](../../../assets/repo/bench/ancestor-prefix-timing.json), [Node memory](../../../assets/repo/bench/ancestor-prefix-memory.json), and [browser timing and memory](../../../assets/repo/bench/ancestor-prefix-browser.json). The result supports further work on prefix caching for shared deep paths. It does not support enabling this prototype generally. Before an engine change, preserve collection-level positional reuse, address shallow-path overhead, and validate callback mutation and public-host queries. Production `nwsapi` is unchanged.

## Share positional state and remove prefix-cache allocations

The previous prefix prototype lost positional reuse by invoking the single-element matcher. The revised experiment takes its prefix from the collection compiler instead. Checked, fixed compiler markers isolate the prefix body, and the outer query clears positional state in a `finally` block. This preserves positional reuse across candidates without retaining it across queries.

The cached variant also removes the weak map and path array. It keeps only the previous starting ancestor and the boolean result of searching that ancestor's chain. Consecutive candidates with that same starting ancestor reuse the result. Other candidates run the full prefix search. There is no depth threshold, and different candidate order changes reuse opportunities rather than selector results.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-reads.mts --shared --output assets/repo/bench/ancestor-shared-timing.json` for unprofiled Node timing. Run it with `--shared --memory --output assets/repo/bench/ancestor-shared-memory.json` for Node allocation and retained heap. Run `node scripts/repo/bench/ancestor-browser.mts --shared --output assets/repo/bench/ancestor-shared-browser.json` for browser timing and memory.

The controls are the unchanged collection resolver and the split prefix with shared positional state but no previous-result reuse. The third variant adds previous-result reuse. All variants use the same candidates within each fixture. Timing excludes compilation and candidate lookup. The earlier sampling methods apply. The helper is still a fixed-selector experiment, not a general compiler transform or a callback-capable implementation.

Mutation checks now move the first box to the end and restore it, in addition to changing suffix and prefix classes between queries. Expected results follow the supplied candidate order, which can differ from document order after the move. The browser fixture clears its new expected-results set before checking detached-node collection.

</details>

The split version fixes the original wide positional regression and reduces allocation, but a no-reuse control exposes remaining overhead. With one candidate per starting ancestor, shallow browser queries are about 4–7% slower. The additional matcher calls and parent reads still cost time when there is no previous result to reuse.

The final experimental variant puts the previous-result check directly into the original compiled ancestor loop. It preserves that resolver's positional state, result handling, and cleanup wrapper. It uses the parent read already needed by the loop rather than adding another read. A hit skips the remaining prefix search. A miss runs the existing prefix code. Two local variables replace the map and path array.

Use `--inline` instead of `--shared` to reproduce this version. The tracked reports are [Node timing](../../../assets/repo/bench/ancestor-inline-timing.json), [Node memory](../../../assets/repo/bench/ancestor-inline-memory.json), and [browser timing and memory](../../../assets/repo/bench/ancestor-inline-browser.json). Add `--single` for the no-reuse controls, recorded in [Node](../../../assets/repo/bench/ancestor-inline-single-timing.json) and [browser](../../../assets/repo/bench/ancestor-inline-single-browser.json) reports. The inline rewrite checks fixed compiler markers and remains confined to these benchmark selectors.

| Inline previous-result reuse | Existing time | Inline time | Time change | Allocation change |
| --- | ---: | ---: | ---: | ---: |
| Node wide complex | 195.10µs | 139.75µs | -28.4% | -32.4% |
| Node wide plain | 107.48µs | 88.35µs | -17.8% | -20.1% |
| Node deep complex | 128.65µs | 77.60µs | -39.7% | -40.7% |
| Node deep plain | 97.78µs | 61.44µs | -37.2% | -39.0% |
| Browser shallow complex | 14.40µs | 10.20µs | -29.2% | -28.0% |
| Browser shallow plain | 9.20µs | 7.90µs | -14.1% | -19.1% |
| Browser deep complex | 34.10µs | 20.50µs | -39.9% | -38.8% |
| Browser deep plain | 23.20µs | 14.70µs | -36.6% | -37.7% |

These are warm compiled-resolver measurements over preselected candidates. The wide Node fixture has 256 candidates, and the deep fixtures have 64 candidates beneath eight extra wrappers. Shallow browser fixtures have 64 candidates. Timing uses seven rotating rounds. Node allocation uses median estimates from three rotating rounds, while browser allocation uses one sample per variant. Each allocation sample covers 2000 calls. Negative changes mean less time or allocation. Both mixed-depth orders also improve in the recorded runs.

In the no-reuse browser control, inline timing ranges from 1.4% slower to 4.9% faster than baseline. The first Node control run had large timing spikes in its final fixtures. The deep-first complex samples ranged from about 51µs to 467µs for the inline variant. A [fresh-process confirmation](../../../assets/repo/bench/ancestor-inline-single-confirmation.json) ranges from 0.7% to 4.1% faster across the controls. Both runs are retained. These small differences do not establish a general speedup without reuse, but the repeat does not reproduce the large regressions of the split matcher.

The inline deep plain Node case has zero measured retained growth after both batches in all three rounds. Deep complex changes from before the first batch to after the second range from -3248bytes to 408bytes. These short whole-process heap readings do not measure peak memory or prove the absence of leaks. Browser detached-node collection passes, as do ordered identity, suffix mutation, prefix mutation, sibling reordering, and reversed candidate-order checks. Lint and type checks pass.

This resolves the measured positional-sharing and shallow-overhead problems in the fixed-selector prototype. It does not yet change the production compiler. Integration still requires emitting the reuse check through the compiler, preserving callback and legacy behavior, and measuring public-host queries before adoption. The benchmark's checked string rewrite is evidence for that implementation, not production parsing logic.

## Integrate ancestor reuse into the compiler

The production compiler now emits the previous-ancestor result check directly. It does not rewrite generated JavaScript. A successful prefix leaves a true result before continuing the candidate loop. A failed search records false after the ancestor walk ends. The next candidate can reuse that result only when its starting ancestor is the same element.

The eligibility pass consumes existing selector tokens and permits one static descendant walk. It excludes callbacks, legacy mode, relative selectors, registered extensions, attributes, namespaces, logical pseudos, filtered positional selectors, and other unsupported forms. Those paths retain their existing matcher. The check is silent for malformed input, so it does not add validation errors. The [resolver design](resolver-execution.md#query-local-ancestor-results) records these boundaries.

<details>
<summary>Measurement scope and reproduction</summary>

The baseline build comes from `05824bf`, before compiler integration. The production comparison scripts accept `--baseline /absolute/path/to/before/nwsapi.js` and record the hashes of both builds. [Node timing](../../../assets/repo/bench/ancestor-production-timing.json), [Node memory](../../../assets/repo/bench/ancestor-production-memory.json), and [browser measurements](../../../assets/repo/bench/ancestor-production-browser.json) use the actual compiled resolvers without experimental rewrites. Node timing runs in a separate process from allocation profiling. Allocation samples cover 2000 calls. Node sampling rotates the two builds over three rounds.

The public-query reports are [before](../../../assets/repo/bench/prefix-host-before.json) and [after](../../../assets/repo/bench/prefix-host-after.json). Run `node scripts/repo/bench/complex-selectors.mts --host /absolute/path/to/prepared/jsdom --output /path/to/report.json` once with each build. The reports also include `@asamuzakjp/dom-selector` controls. The table below compares only the `nwsapi` candidate measurements across those two builds. It uses the prepared `jsdom` host's public query route and includes candidate lookup. Cold-query and mutation samples remain available in the reports.

The public-query runs are separate measurements rather than a guarantee of a fixed improvement on every machine. The fixtures cover original, wide, deep, and mixed trees, using document and element query scopes. Deep trees add eight wrapper ancestors. The complex selector combines sibling positions and descendant classes. The plain selector uses descendant classes and a child relationship.

</details>

| Public document query | Before | After | Change |
| --- | ---: | ---: | ---: |
| Original complex | 120.91µs | 56.61µs | -53.2% |
| Original plain | 57.10µs | 39.27µs | -31.2% |
| Wide complex | 242.98µs | 166.84µs | -31.3% |
| Wide plain | 114.65µs | 95.02µs | -17.1% |
| Deep complex | 126.38µs | 81.38µs | -35.6% |
| Deep plain | 98.79µs | 61.11µs | -38.1% |
| Mixed complex | 68.05µs | 47.17µs | -30.7% |
| Mixed plain | 32.43µs | 26.17µs | -19.3% |

These are warm public document queries through `jsdom`, including candidate lookup. The original fixture has 125 candidates, the wide fixture has 256, and the deep fixture has 64. Negative changes mean faster queries. The reports retain element-scope results and cold samples separately. All candidate-build mutation checks pass, including changes made without an explicit cache-clear notification.

| Node sampled allocation | Before | After | Change |
| --- | ---: | ---: | ---: |
| Wide complex | 391.42MB | 264.68MB | -32.4% |
| Wide plain | 223.15MB | 178.03MB | -20.2% |
| Deep complex | 187.99MB | 111.09MB | -40.9% |
| Deep plain | 145.12MB | 88.43MB | -39.1% |

These allocation estimates cover 2000 warm compiled-resolver calls over preselected candidates. They are medians from three rotating Node sampling rounds. They measure allocation traffic, rather than retained or peak memory. Reusing the ancestor result avoids repeated DOM getter and resolver work while preserving positional caches shared across the candidate collection.

The deep complex candidate's retained heap changes by 8088bytes, 0bytes, and 1312bytes across the three rounds. The deep plain changes are -112bytes, 0bytes, and 0bytes. These short whole-process measurements do not establish an absence of leaks. All browser detached-node checks collect the observed nodes. In Chromium 151, the shallow complex and plain queries take about 27% and 17% less time. Deep complex and plain queries take about 39% less time. Browser allocation also falls in each of these cases.

The readable core grows from 162450bytes to 164627bytes, an increase of 2177bytes. Gzip at level 9 grows by 481bytes, from 39373bytes to 39854bytes. Brotli at quality 11 grows by 405bytes, from 31849bytes to 32254bytes. This is a runtime optimization with a small download-size cost. The standalone memory benchmark measures 9.35KiB after initialization and 76.33KiB after 100 queries for the new build. Its scope differs from the allocation experiment above.

The final build passes 668 unit tests, 148 integration tests, and all 141 selected WPT pages in both modern and legacy modes. One integration test remains skipped. Accumulated execution coverage is 98.53% of lines, and type identifier coverage is 96.42%. Unit tests include callback mutation, arbitrary collection order, null entries, between-query DOM changes, and silent eligibility checks for invalid selectors. The production integration preserves shared positional caching and removes the measured shallow-query overhead of the split-prefix prototype for the recorded cases.

## Check the limits of ancestor reuse

CI passed for `cdf1561`. The follow-up measures the production build against the saved `05824bf` build when each starting ancestor has only one candidate. This removes consecutive result reuse. It also measures uncached compilation and separates public candidate lookup from compiled execution in a Node allocation profile.

<details>
<summary>Measurement scope and reproduction</summary>

Run `node scripts/repo/bench/ancestor-reads.mts --baseline /path/to/before/nwsapi.js --single --output assets/repo/bench/ancestor-production-single-timing.json`. Run the browser script with the same options and a separate output path. The [Node record](../../../assets/repo/bench/ancestor-production-single-timing.json), [browser record](../../../assets/repo/bench/ancestor-production-single-browser.json), and [fresh browser confirmation](../../../assets/repo/bench/ancestor-production-single-browser-confirmation.json) retain seven rotating timing rounds. Compilation and candidate lookup are outside the timers. Mutation, candidate order, and browser detached-node checks pass.

Run `node scripts/repo/bench/compiler.mts /path/to/before/nwsapi.js dist/nwsapi.js assets/repo/bench/ancestor-production-compiler.json`. The [first record](../../../assets/repo/bench/ancestor-production-compiler.json) and [fresh confirmation](../../../assets/repo/bench/ancestor-production-compiler-confirmation.json) use nine rotating rounds. Each compilation receives a unique class suffix to prevent cache hits. The old benchmark used a `:not()` suffix, which excluded every case from ancestor reuse. The revised suffix preserves eligibility. Timing includes resolver source consumption and measures uncached compilation on warm engines, rather than fresh process startup. The suffix classes do not exist in the fixture, and these compiled functions are not executed.

Run `node scripts/repo/bench/candidate-memory.mts assets/repo/bench/candidate-memory.json` for the [allocation record](../../../assets/repo/bench/candidate-memory.json). Three rotating Node sampling rounds cover 2000 calls per route on a static 256-candidate fixture. Compiled execution uses preselected candidates. Public selection includes lookup and query dispatch. Class lookup alone is a diagnostic control. Setup and compilation are outside allocation sampling. Samples include collected objects. These routes can take different optimized paths, so subtracting their totals does not isolate copying cost.

</details>

Without reuse opportunities, Node timing changes range from 3.2% faster to 1.1% slower. Shallow browser cases are 2.3–2.7% slower in the first run and equal to baseline in the fresh confirmation. Deep and mixed browser cases are equal or faster in both runs. This does not establish a consistent shallow regression or a general speedup without reuse. It supports retaining the current narrow eligibility rather than adding another runtime depth gate.

| Uncached compilation, confirmation | Before | After | Added time |
| --- | ---: | ---: | ---: |
| Plain ancestor | 13.88µs | 16.08µs | 2.20µs |
| Positional ancestor | 20.97µs | 25.45µs | 4.48µs |
| Two descendant walks, excluded | 15.28µs | 16.07µs | 0.80µs |

These medians measure unique selectors on warm Node engines. Eligible plain and positional cases add about 16% and 21% to compilation time. The first run also shows about 2µs and 4µs of additional work. The eligibility scan and larger generated function both contribute to the measured path, so this benchmark cannot attribute all of the increase to the scan. Cached queries avoid this compilation cost. Other excluded selectors have smaller, less consistent changes.

| Node sampled allocation, 2000 calls | Compiled | Public selection | Class lookup only |
| --- | ---: | ---: | ---: |
| Simple class | 59.20MB | 5.55MB | 4.73MB |
| Ancestor class query | 127.11MB | 88.10MB | 4.71MB |

These are median allocation estimates, not retained heap. Public selection can remove a terminal class check after fetching candidates by that class, so it allocates less than compiling the complete selector against a supplied array. In the ancestor query's public path, sampled resolver work and class-name getters dominate. Class lookup accounts for about 5% of its total allocation. The `byClass` allocation site contributes about 4.2MB in the middle round, consistent with copying a 256-element array on each call. Sampling and inlining prevent exact source-level attribution.

The production engine remains unchanged in this follow-up. Public lookup results must remain independent arrays, and cached candidate snapshots must be protected from callers and callbacks. Removing those copies broadly would trade away those guarantees for a small share of this workload's allocation. The next focused experiment should reduce uncached eligibility work without adding warm-query branches or broadening supported selectors. Any later internal snapshot borrowing needs its own callback, reentrancy, mutation, and result-array isolation checks.

## Normalize once before ancestor eligibility

The eligibility scan previously normalized comments and combinator spacing before the compiler repeated the same work. It now reads the compiler's normalized selector. Selectors without CSS whitespace return false before token inspection because they cannot contain a descendant combinator. Whitespace inside strings or escapes still goes through the full token check. The accepted selector forms and generated query behavior remain unchanged.

<details>
<summary>Measurement scope and reproduction</summary>

The baseline is the production engine at `7252bf5`. Save its built CommonJS file outside the repository before rebuilding. Run `node scripts/repo/bench/compiler.mts /path/to/before.cjs dist/nwsapi.js assets/repo/bench/ancestor-eligibility-compiler.json`, then repeat in a fresh process with another output path. The [first timing record](../../../assets/repo/bench/ancestor-eligibility-compiler.json) and [confirmation](../../../assets/repo/bench/ancestor-eligibility-compiler-confirmation.json) use unique class suffixes and nine rotating rounds. They measure uncached compilation and resolver source consumption on warm Node engines. They do not measure query execution or fresh process startup.

A separate run with `node --cpu-prof --cpu-prof-dir=/path/to/temporary/directory scripts/repo/bench/compiler.mts /path/to/before.cjs /path/to/before.cjs /path/to/temporary/report.json` located normalization and eligibility work. The [profile summary](../../../assets/repo/bench/ancestor-eligibility-profile.json) groups self samples by function name. It includes module startup, both engine instances, all compiler cases, and garbage collection. Its counts identify work to inspect rather than attributing the entire compilation difference to one helper. Timing conclusions use the unprofiled runs.

</details>

| Uncached compilation, confirmation | Before | After | Change |
| --- | ---: | ---: | ---: |
| Plain ancestor | 16.31µs | 15.32µs | -6.1% |
| Positional ancestor | 25.90µs | 24.57µs | -5.1% |

These are median times for unique selectors on warm engines. The first run improves the plain case by 4.6% and the positional case by 4.2%. Across both runs, the saving is about 0.7–1.3µs per compilation. This recovers part of the earlier eligibility overhead. Other cases vary, including one nested logical case that is 16.8% slower in the first run and about equal in the confirmation. The results support the narrow normalization change rather than a claim that every selector compiles faster.

The generated resolver comparison covers 78 combinations of selector, array or item collection mode, matching mode, and callback setting. All compared function sources are identical before and after. The ancestor-reuse tests also cover comment boundaries, mixed whitespace, and escaped identifiers while checking both matching results and prefix-read reuse. Runtime timing and allocation charts are not remeasured because this change only alters compilation, and those warm-query measurements exclude compilation.

The readable core adds 35bytes. Gzip at level 9 adds 3bytes, and Brotli at quality 11 adds 29bytes. File-size measurements and charts are refreshed for the new build.

Validation passes 668 unit tests, 148 integration tests, and all 141 WPT pages in both modern and legacy modes. One integration test remains skipped. Accumulated execution coverage is 98.53% of lines, and type identifier coverage is 96.42%. The local unit gate takes 3667ms against its 10000ms budget. Formatting, lint, and type checks pass.
