# Small trained planner

## In brief

The learned threshold changed the result for only two held-out cases. It
missed the improvement target in Chromium and regressed in `jsdom`, so we did
not ship it. A simple threshold is not useful unless it makes full queries
faster across the supported cases. See the [performance work guide](guide.md)
for _held-out case_ and speed ratios.

## Recorded outcome: keep the current rule

The shared model trained on 96 observations across Chromium 154.0.8037.0 and
`jsdom` 30.0.1. It pruned to one split: use broad scanning above approximately
39.4% candidate density, versus the existing rule's 33.3%. It has two leaves
and needs no inference library.

Separate evaluation measured the actual guarded expression against the
unchanged runtime on 48 held-out cases per host:

| Host     | Geometric mean rule/tree speed ratio | Worst tree/rule time | Gate                                     |
| -------- | ------------------------------------ | -------------------- | ---------------------------------------- |
| Chromium | 1.020×                               | 1.018×               | Missed minimum improvement               |
| `jsdom`  | 0.995×                               | 1.279×               | Missed improvement and worst-case limits |

The model changed the selected route for only two held-out cases, both in
the clustered 128-node family at 40% requested density. In the two-tag
`jsdom` case, median query time increased from 27.01µs to 34.55µs. The same
count features do not identify host costs or tag arrangement, so a learned
density boundary alone did not transfer reliably. This is evidence against
shipping this model, not a conclusion about all learned planning.

Measurements ran on an Apple M1 Max on battery. Timing variability, the
synthetic family selection, and the narrow supported domain limit the claim.
No production runtime code changed, and no new compatibility suite was run.
Benchmark identity and route-reachability checks completed successfully.

The [HTML report with bar charts](../../../assets/repo/bench/survey-2026-10-03/planner.html)
and [summary JSON](../../../assets/repo/bench/planner-2026-10-03/summary.json)
record the outcome. The [model artifact](../../../assets/repo/bench/planner-2026-10-03/shared-model.json)
includes training-input hashes, bounds, tree, and generated expression.
For a junior-developer walkthrough of the training and the separate `:has()`
decision, open the [tiny model guide](../../../assets/repo/bench/survey-2026-10-03/tiny-model-training.html).

## Experiment contract

The first experiment trains a tiny CPU decision tree to choose the exact
type-union candidate route in `nwsapi`. The alternatives are merging native
tag collections and scanning the broad collection. Both execute the same
compiled selector predicate and preserve ordered results.

The production density rule is the baseline. The experiment changes only
isolated benchmark bundles. It does not add an inference dependency, a model
download, a public configuration flag, or GPU initialization.

### Promotion gate

Before inspecting results, require at least a 5% geometric mean improvement
over the existing rule on held-out families in **each** measured host, with
no held-out case slower by more than 15%. This is an exploratory gate. Passing
it would justify a separate production implementation and broader validation,
not an automatic release. Failing it keeps the runtime unchanged.

### Features and training

Features are candidate count, total element count, distinct tag count, and
their density ratio. These are available at the existing periodic route
probe. No extra DOM traversal is introduced for feature extraction. The
selected route remains cached for the existing 64-call period.

The trainer minimizes normalized route cost rather than classification
errors. A wrong choice that costs twice as much receives a larger penalty
than a close call. Trees have at most three levels and eight leaves, with
at least six training observations per leaf and a 2% normalized cost
improvement required to split. Output is ordinary JavaScript conditions.

Training families are flat, nested, and alternating layouts. Held-out
families are cards, clustered tags, and ragged nesting. Each includes
128 and 1,024 payload nodes, two or six tag alternatives, and four candidate
densities. Family assignment is frozen before timing. These are synthetic
families, not evidence of generalization to real applications.

Host-specific trees are recorded as diagnostics. Evaluation uses one shared
tree trained on normalized costs from both Chromium and `jsdom`. This avoids
a runtime host classifier and gives both measured hosts equal weight. Evaluation uses the
existing rule outside the training envelope: 131–1,155 total elements,
two or six alternatives, 2–819 candidates, and the measured density range.
All bounds come from training observations. Unknown hosts would
also need the existing rule in a production implementation.

<details>
<summary>Measurement and reproduction</summary>

Run from the repository root after building:

```sh
node scripts/repo/run.mts scripts/repo/bench/planner/run.mts collect assets/repo/bench/planner-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/run.mts evaluate assets/repo/bench/planner-2026-10-03
node scripts/repo/run.mts scripts/repo/bench/planner/report.mts assets/repo/bench/planner-2026-10-03 assets/repo/bench/survey-2026-10-03/planner.html
```

Collection compares the current rule, forced merge, and forced broad routes.
Forced routes preserve the periodic total-count read. Evaluation measures
the actual generated model expression, its domain guard, and its fallback
against the untouched production bundle. Bundle and fixture hashes identify
the experiment. A missing or ambiguous replacement marker aborts the run.

The compressed fixture manifest preserves the exact input HTML. Evaluation
reads this frozen manifest. `planner/fit.mts` can retrain from the recorded
route costs without rerunning timing, and writes `shared-model.mjs` alongside
the model JSON. The production runtime never imports that experimental file.

Measurements use seven rounds with rotating variant order. Chromium uses
isolated high-resolution timers and batches of 16 calls for at least 12ms
per round. `jsdom` uses Mitata with the same round budget and batch size.
Ordered element identity is checked against each host's selector API before
and after timing. An untimed instrumented bundle also confirms every fixture
reaches the intended planner before collection or evaluation. All cases are warm all-results queries, including periodic
planner probes. Cold compilation, mutations, first-result APIs, callbacks,
XML, custom extensions, and GPU workloads are outside this measurement.

Native and `jsdom` timing summaries use different estimators: Chromium
records round means, while Mitata records round medians. Comparisons are
within a host only. Artifacts retain all seven round summaries and call
counts, not every Mitata timing sample.

</details>

## Reuse and next decisions

The offline cost-sensitive tree trainer is independent of selector syntax.
The same method can label forward versus inverse `:has` routes or another
eligible exact plan. Each decision needs its own admissible features,
measurement labels, and held-out evaluation. Reusing a model across those
decisions without retraining would be unsupported.

The [follow-up `:has()` experiment](trained-has-planner.md) now records labels,
a trained model, and a guarded implementation. It includes witness-fetch
costs and preserves the small-anchor early exit. The learned preference was
restricted after a training-case regression, then measured in the actual
runtime in two confirmation passes. Real-application and AC-power evidence
remain open. No topology scan was added to obtain model features.

Completed here: route-reachability checks, frozen fixtures, cost-sensitive
training, one shared generated model, separate held-out execution, guarded
fallback, bar-chart report, and recorded rejection for type unions.

Packing DOM snapshots and GPU batching remain later research. This first
experiment establishes whether trained routing beats simple rules before
adding transfer, startup, or inference costs.
