# Trained `:has()` route planner

## Implemented outcome

The model trained on 96 observations across Chromium and `jsdom`. It pruned
to one constant decision: prefer inverse witness marking within its measured
domain. The initial held-out model evaluation passed the gate, at 1.088×
and 1.193× geometric mean speed ratios respectively.

Reviewing training cases exposed a 1.248× time regression for dense,
attribute-filtered flat anchors in Chromium. The implementation therefore
keeps filtered compounds on the existing rule. The learned preference is
restricted to single-class anchors and single-class witnesses, 32–192 anchor
candidates, and at most four witness candidates per anchor. Equality with
the already prepared candidate seed proves each compound is a single class.
This avoids additional regular expressions or parsing. Below the old density
cutoff, dispatch does not consult the new preference at all.

An independent exact preflight returns an empty result when the witness
collection is empty. It skips map allocation and the anchor loop, while
retaining the existing early exit below 32 anchors. Measured by itself on
eligible zero-witness cases, this preflight is 2.024× faster in Chromium and
1.478× faster in `jsdom`.

The production implementation uses these guarded conditions directly. It
does not load a model, allocate feature vectors, run inference, scan for
features, or add per-element telemetry. Existing unsupported-syntax, legacy,
callback, and missing-WeakMap paths retain their fallback behavior.

### Confirmation of the actual build

Two independent passes compare the built runtime with the saved baseline
on all 100 fixtures per host, including training cases and small-query
controls. The second pass reverses fixture order and increases the budget
to 11 rounds of at least 24ms per variant and case.

| Host | First pass speed ratio | Longer repeat speed ratio | Repeat worst candidate/baseline time |
| --- | --- | --- | --- |
| Chromium 154.0.8037.0 | 1.300× | 1.295× | 1.113× |
| `jsdom` 30.0.1 | 1.251× | 1.256× | 1.072× |

On only the 52 held-out cases, the repeat ratios are 1.276× and 1.256×.
The first `jsdom` pass had one 1.176× outlier, exceeding the limit. Its rounds
fluctuated between approximately 39µs and 54µs. In the longer reversed-order
pass that case took 1.018× baseline time. Both records are preserved. This
supports retaining the guarded implementation without claiming every query
is faster or treating these battery measurements as release-wide results.

The `jsdom` cold-query probe uses 25 rotating rounds, fresh engines, and reused
DOMs for eight cases. Engine construction is excluded. Its aggregate ratio
is 1.001×, with a worst-case time ratio of 1.059×. This does not measure cold
application startup or browser cold-query behavior.

The readable build grows by 312bytes, gzip level 9 by 80bytes, and Brotli
quality 11 by 215bytes. The candidate SHA-256 is
`a7d34965762e56d86caa425680b3a791bc6c853a586686ea751f41d35fc22f43`.
Measurements ran on an Apple M1 Max on battery. Ordered identity checks
passed throughout timing. Repository static checks cover the implementation.
The broader unit, browser, and WPT suites were not rerun for this change.

Open the [implementation bar charts](../../../assets/repo/bench/survey-2026-10-03/has-implementation.html),
[experimental model report](../../../assets/repo/bench/survey-2026-10-03/has-planner.html),
or [complete measurement summary](../../../assets/repo/bench/planner-has-2026-10-03/implementation-summary.json).

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
# Build f4bee05 in a separate worktree and save dist/nwsapi.js first.
export NWSAPI_PLANNER_BASELINE=/absolute/path/to/before.cjs
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts collect assets/repo/bench/planner-has-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts evaluate assets/repo/bench/planner-has-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts preflight assets/repo/bench/planner-has-2026-10-03
# Build the candidate, then compare its actual emitted runtime.
node scripts/repo/run.mts scripts/repo/build/run.mts
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts confirm assets/repo/bench/planner-has-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts confirm assets/repo/bench/planner-has-2026-10-03 repeat
node scripts/repo/run.mts scripts/repo/bench/planner/has/cold.mts "$NWSAPI_PLANNER_BASELINE" assets/repo/bench/planner-has-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/has/summary.mts assets/repo/bench/planner-has-2026-10-03 "$NWSAPI_PLANNER_BASELINE"
node scripts/repo/run.mts scripts/repo/bench/planner/report.mts assets/repo/bench/planner-has-2026-10-03 assets/repo/bench/survey-2026-10-03/has-planner.html
node scripts/repo/run.mts scripts/repo/bench/planner/report.mts assets/repo/bench/planner-has-2026-10-03 assets/repo/bench/survey-2026-10-03/has-implementation.html confirmation-repeat
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
