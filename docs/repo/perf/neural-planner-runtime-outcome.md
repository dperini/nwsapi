# Integrated planner measurements

The integrated planner reduced query time on the measured workload. Keep the
selector guard fix and the uncached planner. The extra decision cache did not
produce a consistent improvement in the repeat measurement.

## Read the results

Lower query time is better. These percentages compare the enabled planner
with the engine before integration. Each cell shows the first and repeat pass.

| Workload | Chromium | jsdom |
| --- | --- | --- |
| All 304 queries | 15.4% / 15.4% less | 23.3% / 25.2% less |
| 112 older controls | 0.0% / 1.0% more | 3.0% / 1.5% less |
| 96 crossed layouts | 29.5% / 30.0% less | 41.0% / 44.9% less |
| 96 diagnostic layouts | 16.4% / 17.0% less | 24.2% / 26.4% less |

These are geometric averages. They do not mean that every selector became
faster. The older Chromium controls show a small regression in the repeat.

[Open the bar charts](https://nwsapi-model-guide.localhost:1355/neural-planner-runtime-2026-10-05.html).

## What changed

The integration guard accepted a data-ok attribute presence selector. The
trained cases use an equality selector with value 1. The guard therefore
skipped those cases. It now accepts that exact equality form with single or
double quotes. The other selector restrictions remain in place.

The planner runs inside the normal engine bundle. It uses the existing host
policy and falls back to normal matching outside its supported cases.

## Why we rejected the cache

The trial cached one model decision based on counts and flags. It stored no
elements or query results. Its initial improvement was below 0.5% overall.
The repeat showed almost no change in Chromium and slightly more time in
jsdom. This does not justify adding cache state to the production path.

## Measurement limits

Both passes ran on AC power with frozen policies. The first used nine rounds
of at least 12ms. The repeat used at least 16ms and reversed case and version
order. The harness checked native element identities and result order before
and after timing.

These fixtures were examined during earlier work. This is evidence for tuning
this workload, not an independent evaluation of new applications. Cold calls,
DOM mutations, alternating selectors and new workloads still need measurement.
The benchmark selects each host policy explicitly outside query timing.

## Reproduce the report

The two planner-runtime-fixed-2026-10-05 measurement directories under
assets/repo/bench contain timings, fixture hashes and compressed source bundles.
The runtime/run.mts benchmark accepts the archived uncached.cjs.gz and
cached.cjs.gz inputs. Use a new output directory for a new measurement.
The runtime/report.mts script accepts the first directory, repeat directory
and output HTML path. It checks that both passes use identical source bundles
and fixtures before drawing the charts.

## Quality audit follow-up

The report now shows the retained planner’s worst query as well as the cache
trial’s worst query. The worst retained result took 26.6% more time in Chromium
and 21.7% more in jsdom in the repeat. Averages must not hide these results.

The largest repeat slowdown in both hosts was diagnostic-15-0.8-144-3-0.
Its first-pass ratios were 97.8% in Chromium and 100.0% in jsdom. This difference
between passes means the slowdown needs focused measurement before assigning
its cause. Other slower repeat cases were also unfiltered controls.

The production planner intentionally excludes unfiltered queries. Its exported
policy previously included a dense unfiltered category that could never pass
both the witness-count guard and the ratio limit. That dead category is removed.
This does not expand the production planner’s selector scope.

The jsdom parent reader now falls back to public parentElement access when an
implementation has no parentNode property. A null parent remains a valid result
for a detached node.

Still required: focused AC measurements of slower cases and measurements through
default browser and jsdom adapter entrypoints. Those measurements must include
cold calls, alternating selectors and DOM mutations. The current warm benchmark
explicitly selects host policies and cannot establish these additional results.

## Follow-up outlier measurement

A third full pass ran on AC with the same 304 queries and reversed case and
variant order. The query `diagnostic-15-0.8-144-3-0` took 121.9% of baseline
time in Chromium and 124.0% in jsdom. This query is unfiltered, so the neural policy is ineligible and does not select its route. The repeat therefore does not show that the model caused this slowdown. Earlier passes ranged from 97.8% to 126.6% in Chromium and 100.0%
to 121.7% in jsdom, so its size is variable.

In the third pass, the integrated build with the planner disabled took 98.5%
of baseline time on this query in Chromium and 100.9% in jsdom. That suggests
the slower result may come from planner-enabled routing or measurement noise.
The six slowest rows include unfiltered queries where the model is ineligible. Among model-eligible rows, the slowest took 104.2% of baseline in Chromium and 105.8% in jsdom. The disabled planner took 99.0% and 101.0% on those respective rows, suggesting small route-specific regressions that need more focused repeats. The report compares planner-off, planner-on and cached variants. The pass uses previously examined fixtures and does not qualify new
applications.

Raw timing rows and compressed bundles are in
`assets/repo/bench/planner-runtime-quality-2026-10-05-r1/`. Rebuild the report
with the optional quality-pass directory argument to include its slowest rows.

## General selector optimization with the planner disabled

The bulk `:has()` fallback used to call the planner helper even when the
planner was disabled. The helper immediately returned in that case. The engine
now checks the feature flag and registered callback before calling it. The
cold-path setup also defers building the optional bulk subplans until a later
cached query has at least 32 anchor candidates.

The AC microbenchmark compares the archived pre-integration engine with the
integrated engine after disabling the planner. It times the first selector call
on a fresh engine and a warmed call, using the same jsdom document. A third pass
compares the deferred setup with the new disabled-planner fast check.

| Selector | Cold, before → after | Warm, before → after |
| --- | ---: | ---: |
| `.item:has(.hit)` | 1.038ms → 1.032ms | 0.1483ms → 0.1483ms |
| `.item:has(.absent)` | 0.679ms → 0.679ms | 0.0016ms → 0.0015ms |
| `.anchor:has(.hit)` | 0.183ms → 0.184ms | 0.1000ms → 0.0978ms |
| `div.card` | 0.196ms → 0.200ms | 0.0581ms → 0.0583ms |
| `[data-x="1"]` | 1.540ms → 1.539ms | 0.3242ms → 0.3240ms |
| `ul li a` | 2.318ms → 2.291ms | 0.1874ms → 0.1878ms |
| `main > section:nth-child(3)` | 1.727ms → 1.767ms | 0.0234ms → 0.0232ms |

These small differences show a neutral result for ordinary selectors and a
small warm-query improvement for the dense `:has()` case. They do not prove a
broad cold-query win. The fixture uses one jsdom tree, seven selector shapes,
and 31 alternating samples. It does not represent new applications or measure
browser or adapter setup time. The script checks result identity against native
selection and verifies that a DOM mutation changes the next query result.

Run the AC measurement with:

```sh
NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts scripts/repo/bench/planner/dispatch/runtime/cold.mts assets/repo/bench/planner-runtime-cold-2026-10-05-r3.json assets/repo/bench/planner-runtime-cold-2026-10-05-r3.baseline.cjs.gz
```

The JSON and compressed source bundles in `assets/repo/bench/planner-runtime-cold-2026-10-05-r3.json` record this pass. The cold benchmark is diagnostic and should not be read as a general speedup claim.
