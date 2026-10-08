# Selector cache scan: issue 242

The repeated-scan cache failure in [issue #242](https://github.com/dperini/nwsapi/issues/242) still occurs on both branches as of October 7, 2026. V3 raises the entry bound and uses two generations, which improves smaller scans. Larger scans can still miss on every match.

The [October 8 V3 follow-up](selector-cache-mitigation-outcome.md) adds configurable budgets, changes compiled-plan admission, and records the resulting runtime, compilation, and memory measurements. The findings below describe the earlier revisions.

## Recorded scope

The [recorded inputs and counts](../../../assets/repo/bench/issue-242-cache-scan-2026-10-07.json) include the reproduction source and per-pass results. The run used Node.js 26.11.0 and `jsdom` 30.0.1, with these fetched revisions:

- `master`: `f31684deb8a6ba0d85da7a38b6d150b9bb5d0c99`.
- `prerelease/3.0.0`: `4091c821cbe38a6d5b0cb8615b9389879e77d9c9`.

Each case warms all selectors once, then makes ten scans in the same order against one paragraph. Wrappers observe the engine's own resolver lookups and compiled-function cache insertions. They make no extra cache reads that could promote entries. These are cache counts from direct `match()` calls.

| Selector scan                     | `master` hit rate | V3 hit rate |
| --------------------------------- | ----------------: | ----------: |
| 1,000 class selectors             |              100% |        100% |
| 1,001 class selectors             |                0% |        100% |
| 2,300 class selectors             |                0% |      88.00% |
| 4,097 class selectors             |                0% |          0% |
| 2,300 Ant Design-shaped selectors |                0% |          0% |

The complex selectors are `:where(.css-x).ant-btn-${i}:not(:disabled):not(.ant-btn-disabled):hover`. At 2,300 selectors, both branches record 23,000 resolver misses and 23,000 compiled-function insertions over 23,000 measured calls. The reported application's timeout was outside this run's scope.

## Why it remains

`master` uses strict LRU eviction with 1,000 entries and an estimated 2MB budget per plan cache. A cyclic scan beyond the resident set evicts the next selector needed.

V3 uses a 4,096-entry, two-generation cache with the same 2MB budget. Each generation receives half the entry and byte bounds. Generation rotation can discard entries that the scan is about to revisit. The byte bound also makes complex selectors exhaust the cache before the entry bound.

Both branches coerce `configure()` values to booleans. Neither exposes numeric cache budgets through that API. Increasing the entry bound alone does not address byte-bound scans or make eviction preserve a useful subset under every cyclic scan.

No runtime change was made for this investigation.
