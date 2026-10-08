# Selector cache scan mitigation in V3

V3 exposes numeric cache budgets and limits admission when compiled-plan caches are full. Existing entries move to the most recent position on a hit. A local deterministic sequence admits approximately one in eight new entries that require eviction. Entries that fit without eviction are admitted immediately. This retains useful plans during repeated scans while allowing a changing workload to replace old plans.

This addresses the repeated-scan failure measured for [issue #242](https://github.com/dperini/nwsapi/issues/242) in the cases below. It does not reproduce the reporter’s complete application. Oversized individual plans remain uncached, and workloads larger than the budgets still incur misses.

<details>
<summary>Measurement scope and reproduction</summary>

Recorded on 2026-10-08 using Node.js v26.11.0, darwin/arm64, Apple M1 Max. Baseline: `c6ccba8b2a9fd04a11ddc830491f00461815d40b`. Candidate: `021544c12c607c7e215f8b5e9af107a12a8906cb`. [Recorded inputs, samples, counts, and bundle hashes](../../../assets/repo/bench/issue-242-cache-mitigation-2026-10-08.json).

Each timing sample runs in a fresh process with the same DOM and query sequence. There are three timing samples per case. The table reports medians. Timing includes the complete `match()` calls after one warmup scan. A separate instrumented process observes actual resolver-cache reads and counts dynamic `Function` construction. It also checks every match result. No extra cache reads are used to measure hits.

Heap deltas compare explicit garbage collections before warmup and after the measured queries while the engine, document, and selector traces remain reachable. They include VM compilation and other process effects. They are not exact cache sizes. Estimated retained bytes are checked separately for each cache and must remain within its configured budget.

Both default variants use 4,096 entries and 2MiB per compiled-plan cache. The expanded variant uses `CACHE_LIMIT: 8192` and `CACHE_BYTES: 8 * 1024 * 1024`. These limits apply per cache, not to the whole engine or process.

```sh
node scripts/repo/run.mts scripts/repo/bench/cache/scan.mts before.cjs dist/nwsapi.js assets/repo/bench/issue-242-cache-mitigation-2026-10-08.json
node scripts/repo/run.mts scripts/repo/bench/cache/report.mts assets/repo/bench/issue-242-cache-mitigation-2026-10-08.json docs/repo/perf/selector-cache-mitigation-outcome.md
```

Build `before.cjs` from the baseline revision using the repository build command. Build the candidate before running the comparison. The collector starts workers with `--expose-gc`.

</details>

## Default budgets

| Case | Before hits | After hits | Before runtime | After runtime | Function constructions before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| small-warm | 100.00% | 100.00% | 17.45ms | 18.47ms | 0 → 0 |
| class-1000 | 100.00% | 100.00% | 15.63ms | 15.90ms | 0 → 0 |
| class-1001 | 100.00% | 100.00% | 15.38ms | 16.41ms | 0 → 0 |
| class-2300 | 88.00% | 100.00% | 54.47ms | 43.18ms | 244 → 0 |
| class-4097 | 0.00% | 99.97% | 211.77ms | 78.32ms | 40970 → 11 |
| complex-2300 | 0.00% | 58.26% | 390.24ms | 148.46ms | 23000 → 5062 |
| hot-with-one-offs | 50.00% | 50.00% | 724.72ms | 726.70ms | 23000 → 23000 |
| changed-stylesheet | 83.54% | 87.31% | 143.62ms | 140.94ms | 2794 → 3928 |

Class cases scan simple class selectors. The complex case scans 2,300 selectors shaped like `:where(.css-x).ant-btn-N:not(:disabled):not(.ant-btn-disabled):hover`. The small warm case makes 64,000 calls. Other steady scans make ten passes. The mixed case alternates 32 frequently reused selectors with one-off selectors. The changed case replaces the original 2,300 selectors and makes twenty passes over the new set.

The mixed workload keeps a 100% hit rate for its frequently reused subset in both versions. The changed-stylesheet case produces more Function constructions during the transition with sampled admission. Small warm timings can also be higher. These tradeoffs accompany the large reductions for oversized steady scans, rather than demonstrating a universal speedup.

## Larger host-selected budgets and memory

| Case | Expanded hits | Expanded runtime | Heap delta before | Heap delta after | Heap delta expanded |
| --- | ---: | ---: | ---: | ---: | ---: |
| small-warm | 100.00% | 18.03ms | 0.60MiB | 0.61MiB | 0.61MiB |
| class-1000 | 100.00% | 16.07ms | 5.03MiB | 5.08MiB | 5.08MiB |
| class-1001 | 100.00% | 16.08ms | 5.03MiB | 5.09MiB | 5.09MiB |
| class-2300 | 100.00% | 42.51ms | 11.10MiB | 11.33MiB | 11.33MiB |
| class-4097 | 100.00% | 80.36ms | 16.90MiB | 19.86MiB | 19.86MiB |
| complex-2300 | 100.00% | 48.77ms | 15.06MiB | 13.81MiB | 12.03MiB |
| hot-with-one-offs | 50.00% | 729.09ms | 41.27MiB | 42.40MiB | 44.29MiB |
| changed-stylesheet | 95.00% | 125.89ms | 15.12MiB | 16.24MiB | 16.40MiB |

Expanded budgets can hold both the simple and complex steady scans. The changed workload includes its first cold pass, so an aggregate hit rate below 100% does not imply continuing misses. One-off selectors cannot produce hits. Heap deltas depend on garbage collection and VM code retention and should be interpreted alongside the recorded per-cache estimated byte counts. The new policy can retain more entries within the same bounds, so it can use more heap than the rotating generations on some workloads.

## Configuration contract

- `CACHE_LIMIT` and `CACHE_BYTES` accept nonnegative safe integers. Zero disables retention for the applicable caches.
- Changes clear existing query caches and apply immediately. Invalid numeric values throw before changing options. Existing Boolean options retain their behavior.
- Configure the host’s actual engine. The V3 `DOMSelector` adapter accepts these numeric settings before its first use.
- The no-`Map` fallback uses the same compiled-plan policy and limits. Fixed-size helper caches retain their own bounds.

The separate [V2 draft PR](https://github.com/dperini/nwsapi/pull/243) exposes configuration with its existing defaults and LRU policy. It is a mitigation when a stylesheet fits the host-selected bounds, rather than the V3 admission-policy change.
