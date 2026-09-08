# Memory audit: third optimization pass

Measured on September 8, 2026 against `nwsapi` revision `c032788`, after the first two memory passes. This round reduces both repeated grammar storage and temporary allocations on compiler cache hits.

<details>
<summary>Measurement method and limits</summary>

Retained-heap measurements use Node.js v26.5.0 on macOS arm64 and Chromium 151.0.7922.34. The existing snapshot harness retains 100 engines sharing one `jsdom` document, with 100 distinct `.item:not(.absentN)` selectors per engine. The browser harness retains 40 engines in separate native iframe documents and calls both `select` and `first` for 100 compound selectors per engine. Documents and the shared factory exist before the measured engine allocations. Four event-loop turns and explicit garbage collections precede each measurement.

The new allocation harness warms 100 matching resolvers, then checks their identity across 100,000 compiler cache hits. Sampling uses a 512-byte interval and includes objects discarded by both major and minor GC. It forces collection before stopping the sample. These options distinguish allocation churn from surviving objects, as specified by the [V8 inspector protocol](https://chromedevtools.github.io/devtools-protocol/v8/HeapProfiler/#method-startSampling). Results below use the median of three separate runs per build.

Allocation samples estimate bytes allocated over time. They are not retained heap or exact allocation counts. The compiler workload isolates repeated `compile` calls, so its reduction does not imply the same reduction for ordinary cached `select` calls. Heap results exclude process RSS, native browser allocations, pre-existing documents, and module-loading costs. Factory sharing is amortized across engines.

Baseline engine SHA-256: `2baf7e70f272a3b85bee9f97b7903e92d851082258ad326a0db6c3b55b82d281`.

Optimized engine SHA-256: `713cc9c0ff618594d41f2c7224ec74530d478735620465dcbc64a28da74c34fb`.

</details>

## Results

| Measurement                                   |       Before |        After |                Change |
| --------------------------------------------- | -----------: | -----------: | --------------------: |
| Sampled allocation per compiler cache hit     |    391 bytes |     95 bytes |            75.8% less |
| Node idle heap per engine                     | 23,065 bytes | 21,122 bytes |             8.4% less |
| Chromium idle heap per engine                 | 11,773 bytes | 11,610 bytes |             1.4% less |
| Node added heap per cached `select` selector  |    493 bytes |    495 bytes | Essentially unchanged |
| Node engines plus populated caches, 100 × 100 |       7.24MB |       7.06MB |             2.4% less |

The allocation row measures temporary work on an already-cached compiler result. The retained-heap rows measure idle engines and populated query caches. Cache entries remain essentially the same size, so idle savings become a smaller percentage once caches are populated. The smaller Chromium improvement reflects its existing sharing of regex source storage.

## Changes and structural evidence

- **Fixed regexes are literals.** The engine no longer assembles the fixed normalization and pseudo-class patterns from intermediate strings. All 31 sources and flags were compared with the generated baseline and match exactly. Each engine still owns separate regex objects and their mutable `lastIndex` state. Configurable identifier grammar remains separate. Snapshot string growth across 100 idle engines fell by about 186KB.
- **Compiler hits skip parser bookkeeping.** Ancestry arrays, the ancestry record, and helper-alias bookkeeping are initialized only after a cache miss. The isolated intermediate experiment reduced sampled compiler allocation from about 390 to 223 bytes per call.
- **Compiler flag prefixes are precomputed.** A literal table replaces repeated concatenation of mode, callback, and relative flags. It preserves existing cache-key strings, including the fallback for nonstandard mode arguments. This brought the final sampled allocation to 95 bytes per call. The table is bounded and adds no selector cache.

Final snapshot node sizes corroborate the aggregate idle result: baseline-to-instances growth fell from 2,307,608 bytes to 2,113,368 bytes. An intermediate run had noisier `heapUsed` accounting, so its aggregate idle result is not used for the final comparison. The snapshot structure consistently showed the eliminated strings.

## Eviction and lifecycle audit

A separate workload executed 65,536 calls across 32,768 distinct selectors through `select` and `match`. At both 16,384 and 32,768 selectors, all four observed caches contained 4,096 entries. All 100 tracked early matching resolvers were collected after eviction in both builds. Clearing the caches returned their sizes to zero.

The optimized process retained about 13.16MB above its baseline at the first checkpoint and 13.21MB at the second. This is a plateau for the tested workload, not a proof about every selector mix. Residual heap after clearing included runtime overhead and was not classified as a leak merely because it remained above baseline. Cache capacity and eviction policy are unchanged.

Both Chromium builds collected all 4,000 tracked detached nodes,40 released engines, and 40 removed iframe documents. Both Node builds collected all 2,000 tracked detached nodes. These checks cover settled observers, engine release while documents remain live, and subsequent document release. They do not cover every application lifecycle or installation mode.

## Correctness and timing

The focused run passed 263 tests across 10 files, including new coverage of compiler mode, callback, and relative-anchor combinations. The test reuses cached resolvers and changes anchors to verify runtime behavior. Existing coverage includes escapes, forgiving validation, extension isolation, ancestor filters, property reads, and cache generations. Chromium integration, type checking, and targeted lint passed. Generated JavaScript was rebuilt.

An isolated timing experiment alternated builds over 15 measured rounds:

| Workload                      | Before median | After median |
| ----------------------------- | ------------: | -----------: |
| 100,000 warmed compiler calls |       12.61ms |       8.82ms |
| 30,000 hot `select` calls     |       45.08ms |      44.71ms |
| 30,000 hot `match` calls      |        6.65ms |       6.84ms |

Compiler timing ranges were 12.29–14.19ms before and 8.59–10.07ms after, supporting a roughly 30% improvement for this workload. Query timings overlapped: 44.37–47.50ms versus 43.62–46.16ms for `select`, and 6.26–7.58ms versus 6.58–7.49ms for `match`. This does not establish a general query-speed improvement.

The initial mixed timing run had noisy construction medians of 4.00ms before and 6.46ms after for 500 engines. A follow-up isolated construction, warmed both factories, and ran GC before each batch outside the timer. Across 21 alternating rounds of 100 engines, medians were 0.90ms before and 0.58ms after. Cold-query timings also remained bimodal. The controlled construction result supports the implementation change, but does not predict end-to-end latency or GC pauses.

## Reproducing and inspecting

```sh
pnpm run build
pnpm run bench:allocation-profile --output /tmp/compiler-candidate
pnpm run bench:memory-profile --count 100 --queries 100 --output /tmp/heap-candidate
pnpm run bench:memory-browser-profile --output /tmp/browser-candidate
```

Each profiler accepts `--engine /path/to/baseline.cjs`. The allocation profiler also accepts `--iterations` and `--interval`. Load `.heapprofile` and `.heapsnapshot` artifacts in Chrome DevTools' Memory panel. Use the GC-inclusive allocation profile for churn and snapshot comparisons for retention.

Local evidence:

- `/tmp/nwsapi-round3-before/` and `/tmp/nwsapi-round3-final/`: Node snapshots.
- `/tmp/nwsapi-round3-native-before/` and `/tmp/nwsapi-round3-native-final/`: Chromium snapshots and lifecycle counts.
- `/tmp/nwsapi-round3-alloc-before{,2,3}/` and `/tmp/nwsapi-round3-alloc-final{,2,3}/`: allocation samples and summaries. `/tmp/nwsapi-round3-alloc-after/` isolates deferred bookkeeping.
- `/tmp/nwsapi-round3-churn-before.json` and `/tmp/nwsapi-round3-churn-final.json`: eviction checkpoints.
- `/tmp/nwsapi-memory-speed-round3-final.json` and `/tmp/nwsapi-round3-construction.json`: timing samples.
- `.cache/memory-audit/{compare,churn,construction}-round3.mjs`: local timing and churn harnesses.

Temporary artifacts and ignored local harnesses are not committed. The remaining large costs are engine-local closures, compiled resolvers, and populated caches. Reducing those further needs workload-specific reuse measurements or a larger ownership refactor, not simply lower cache limits.
