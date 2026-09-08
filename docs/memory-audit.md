# Memory audit

Measured on September 8, 2026, using Node.js v26.5.0 on macOS arm64. The baseline is the generated `nwsapi` build from revision `966a139`. Measurements concern retained V8 JavaScript heap, not process RSS or native DOM memory.

## Findings and changes

| Workload                                             |     Baseline |    Optimized | Reduction |
| ---------------------------------------------------- | -----------: | -----------: | --------: |
| Idle engine, shared document                         | 29,240 bytes | 27,660 bytes |      5.4% |
| Added heap per cached selector                       |    757 bytes |    490 bytes |     35.2% |
| Engine and cache growth, 100 engines × 100 selectors |      10.49MB |       7.67MB |     26.9% |

These cases retain 100 engines against one `jsdom` document. Each engine executes 100 distinct `.item:not(.absentN)` selectors against one matching element. Sharing the document isolates engine overhead. Repeating selector strings across engines also amortizes V8 code compilation. These numbers do not predict the footprint of independent documents or different selector mixes.

Two source changes reduce retained allocations:

- Query plans allocate their resolver and candidate-token arrays at the known selector-list length. Snapshot element-backing storage growth fell from 3,085,984 bytes to 511,984 bytes across the measured workload. Incrementally growing those arrays reserved unused slots.
- Generational caches allocate the older map only after the first rotation. Empty engines and cleared caches avoid an unused map and its backing storage. Cache capacity, promotion, and eviction behavior remain unchanged.

The array-only experiment reduced cache growth from 758 to 490 bytes per selector. A second run measured 757 to 468 bytes. Variation in compilation and heap bookkeeping affects the aggregate, so the structural snapshot evidence matters alongside the byte totals.

## Profiling method

`pnpm run bench:memory-profile` records five V8 heap snapshots, an allocation-sampling profile, and a JSON summary. Each snapshot follows four event-loop turns and explicit inspector garbage collections. Artifacts default to a new temporary directory. The summary records the engine SHA-256 and Node.js version.

```sh
pnpm run build
pnpm run bench:memory-profile --count 100 --queries 100 --output /tmp/nwsapi-heap-candidate
pnpm run bench:memory-profile --engine /path/to/baseline.cjs --count 100 --queries 100 --output /tmp/nwsapi-heap-baseline
```

The phases are warmed baseline, retained idle engines, populated caches, detached subtree after another live-document query, and released engine references. Open the `.heapsnapshot` files in Chrome DevTools' Memory panel with **Load**. Compare the baseline and instances snapshots for construction overhead, then instances and cached for query-plan retention. Inspect retainers before treating a large shallow allocation as an engine leak. The `.heapprofile` identifies allocation call stacks.

The initial sample attributed about 3.4MB of sampled allocations to `collect`. Snapshot deltas showed resolver-plan array backing stores as the larger retained allocation opportunity. Sampling is approximate and measures a different quantity from total retained heap.

## Correctness and speed

The detached-subtree case queried 2,000 nodes, removed the subtree, returned the engine to the live document, and allowed mutation observers to settle. Both versions retained zero of the tracked detached nodes. This tests one ownership scenario, not every document lifecycle. The released phase can retain shared compiled code and runtime caches, so its difference from baseline is not automatically a leak.

Focused tests cover cached selector lists, duplicate selectors, DOM mutation, first-result queries, generational promotion, eviction, and legacy map fallback. A Chromium integration smoke test also passed. Type checking and targeted lint validate the profiler and source changes.

An isolated timing experiment alternated baseline and candidate over 15 rounds in one process. Each hot round executed 30,000 queries against five matching nodes. Median hot time was 43.13ms before and 43.42ms after, a 0.7% difference within the observed ranges. Cold timings varied substantially with compilation and garbage collection, so this audit makes no cold-speed improvement claim. An earlier timing run overlapped snapshot collection and was discarded.

## Further opportunities

1. **Shared immutable grammar data.** Idle snapshots contain repeated regular-expression strings, objects, and closures. One large validator string accounts for about 148KB across 100 engines. Sharing compiled grammar may help multi-document workloads, but custom operators, configuration, and regex state require isolation tests before changing ownership.
2. **Cache working-set policy.** The current limit is 4,096 entries per cache. This audit preserves it. Use the existing `bench:cache` workloads to measure hit-rate and throughput tradeoffs before reducing capacity.
3. **Browser lifecycle coverage.** Capture native Chromium snapshots for detached iframe documents and long-running mutation workloads. The current browser check validates functionality, while the memory measurements use `jsdom`.
4. **Existing retention benchmark.** `bench:memory` runs synchronous collections without yielding or closing its `jsdom` windows between measurements. Its detached-node delta cannot isolate observer-delivery and window-lifecycle effects. Use the settled snapshot scenario for this audit rather than treating that delta as a proven leak.

No speculative grammar sharing, cache-limit changes, or unrelated cleanup is included.

## Local artifacts

- `/tmp/nwsapi-heap-before-repeat/`: baseline snapshots and summary.
- `/tmp/nwsapi-heap-final/`: optimized snapshots, allocation profile, and summary.
- `/tmp/nwsapi-memory-speed-final.json`: final interleaved timing samples.

Temporary artifacts are not committed and may be removed by the operating system.
