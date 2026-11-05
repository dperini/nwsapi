# Selector cache admission in V2

The candidate adds sampled admission for new resolver entries when an existing cache must evict to remain inside its configured limits. Existing cache hits still promote entries. The default entry limit and byte limit are unchanged.

In this synthetic scan, admission avoids the repeated eviction cycle when a stable selector set is just larger than the 1,000-entry limit. The baseline compiled all 1,001 selectors again on each pass, while the candidate retained nearly all of them after the first scan. Larger class and complex-selector scans also showed fewer `Function` constructions and lower median time in this run. The mixed workload kept all warmed hot selectors, while each one-off still compiled once. A changed selector set still has a cold transition cost, though later passes benefited from retaining a sampled set of replacements.

These results describe the cases in the [generated measurements](../../../assets/repo/bench/v2-cache-admission-2026-10-11.md), not the complete application in the original report. The collector also recorded the unaggregated samples, per-query and raw cache lookup counts, compile counts, source fingerprints, and per-cache bounds in the [JSON recording](../../../assets/repo/bench/v2-cache-admission-2026-10-11.json).

Reproduce from this worktree with Node.js 26 and `jsdom` 26.1.0:

```sh
git worktree add --detach .cache/cache-baseline ffe3bade81732e6d4e1d4993393483871692d28b
node scripts/repo/bench/cache/scan.mts \
  .cache/cache-baseline/src/nwsapi.js \
  src/nwsapi.js \
  assets/repo/bench/v2-cache-admission-2026-10-11.json
node scripts/repo/bench/cache/report.mts \
  assets/repo/bench/v2-cache-admission-2026-10-11.json \
  assets/repo/bench/v2-cache-admission-2026-10-11.md
```

The timing samples use fresh processes. A separate pass validates match results, and the counts pass checks both cache limits after each call. The benchmark measures synthetic selector traces under `jsdom` and does not model stylesheet parsing or a full application workload.
