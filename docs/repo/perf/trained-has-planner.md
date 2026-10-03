# Trained `:has()` route planner

## Experiment contract

This experiment reuses the cost-sensitive CPU tree trainer to choose forward
anchor searches or inverse witness marking in `nwsapi`. Both paths perform
exact matching. The model only chooses the route.

The promotion gate is fixed before collecting results: at least a 1.05×
geometric mean speed ratio against the existing rule in both Chromium and
`jsdom`, with no held-out case taking more than 1.15× baseline time. Passing
would justify a production implementation and further compatibility work.

The original compiled bundle stays untouched. Isolated benchmark variants
force forward or inverse routing after the existing witness lookup, so both
labels include that cost. The early return for fewer than 32 anchors stays
in every variant. Four small-query controls exercise this boundary.

Features are anchor count, witness count, an attribute-clause mask computed
once during plan preparation, and the witness/anchor ratio. An untimed instrumented bundle verifies the
actual feature values and route reachability for every fixture. An initial
training pilot found that predicate-presence flags were constant even for
plain selectors. The final collection uses attribute-clause flags instead,
with no held-out evaluation used to make that choice.
No DOM scan or per-element telemetry is added to obtain features.

Training families are flat anchors, nested anchors, and witnesses outside
anchor subtrees. Held-out families use ragged nesting, clustered witnesses,
and mixed nested/flat anchors with some external witnesses. Family assignment
precedes timing. Each family crosses 32 and 192 anchors, four witness ratios
(zero, 0.125, one, four), and plain or attribute-filtered selectors. There
are 48 training and 52 held-out observations per host, including small-query
controls. These are synthetic workloads.

The shared model trains on both hosts with equal case weights and normalized
route cost. Tree depth, minimum leaf count, and split penalty match the
type-union experiment. Bounds come exclusively from training observations.
Out-of-domain inputs use the current ratio rule. The existing compiler
eligibility gates and callback exclusion still apply before model dispatch.

<details>
<summary>Measurement and reproduction</summary>

```sh
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts collect assets/repo/bench/planner-has-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts evaluate assets/repo/bench/planner-has-2026-10-03
```

Seven rounds rotate variant order. Each Chromium round batches 16 queries
for at least 12ms and records mean query cost. `jsdom` uses Mitata round
medians with the same budget. Summary costs are medians of the seven rounds.
Ordered element identity is checked before and after timing. Collection
stores forced-route labels and the existing rule. Evaluation independently
measures the generated guarded expression against the production bundle.

Fixtures, model, raw round summaries, call counts, bundle hashes, host
versions, power state, and CPU are recorded. Timing covers warm all-results
queries. Cold compilation, first-result APIs, mutation, callbacks, and
unsupported selector shapes require separate evidence before promotion.

</details>
