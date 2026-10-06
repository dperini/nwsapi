# Neural planner implementation guide

## In brief

This guide describes an experiment that uses a small trained model to choose
between exact query strategies. The model does not decide which elements
match CSS. The measured model made queries slower, so it remains a development
experiment. Use the [performance work guide](guide.md) for the terms _route_,
_feature_, and _complete query time_ before following the detailed plan.

This document is a detailed implementation plan. It explains how to repair the
experiment, test whether a small PyTorch model can choose a faster query
method, and turn that model into JavaScript without adding an ML package to the
runtime. Start with the summary and terms. Then follow the phases in order.
Each phase names the files, behavior, checks, and evidence it needs.

The goal is to reduce complete query time and return exactly the same elements
in the same order. The model is only one possible way to reach that goal. The
investigation can end by rejecting the model. Do not call an unmeasured
candidate, a route-only result, or a failed promotion a runtime win.

**Current status:** the repaired measurement tools, scalar exporter,
four-anchor prototype, and PyTorch trainer are implemented. The query-time
pilot is slower than the current engine, so no model enters the runtime. The
[outcome](neural-planner-outcome.md) gives the measurements. The
[task list](neural-planner-task-list.md) shows which work is complete and
which work remains. Broader workload and release checks are still planned.

## Start here

1. Read this guide, the task list, and the checkout's `AGENTS.md`.
2. Run `git worktree list` to find the checkout you will use. Do not assume the
   current directory is the v3 worktree.
3. Check the branch, worktree status, and recent commits before editing.
   Preserve unrelated changes. Use an isolated worktree if the target checkout
   is busy. Do not force-push or remove another person's worktree.
4. Complete phases 0–4 before drawing a new conclusion about model quality.
5. Complete phase 5 even if training does not win. It measures inference cost
   and provides a correct exporter.
6. Treat phases 6–8 as experiments. Apply their gates before adding runtime
   behavior or starting phase 9.
7. Finish with a build check, reports, and the real status of every task. Keep
   a candidate out of the runtime when it fails a gate.

Use the repository's pinned tools. `pnpm run setup:model-training` installs
the project's Python tools: `uv`, Python, NumPy, and PyTorch. Version pins live
in `.config/external-tools.json`,
`.config/model-training/pyproject.toml`, and
`.config/model-training/uv.lock`. The manifest selects Python 3.12 and PyTorch
2.14.1. Use this environment. Do not install a second global Python
environment or add a machine-learning package to the runtime.

## Terms used in this guide

For `.card:has(.badge)`, an **anchor** is a possible `.card` match. A
**witness** is a possible `.badge` match inside the card. A more complex
selector may need extra attribute checks before either element matches.

The **forward route** checks each anchor and searches below it for a witness.
It can stop searching that anchor after it finds a witness. The **inverse
route** finds witnesses first, marks their ancestors, and then checks which
anchors have a mark. The inverse route can share work between anchors. Both
routes must return the same elements in the same order.

| Term              | Meaning                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Training          | Change a model's weights offline using recorded examples.                                                                                      |
| Inference         | Run the trained model to choose a query method. Count this time as part of the query.                                                          |
| Feature           | A fact the model can read, such as an anchor count. The code must get this fact before the decision.                                           |
| Label             | The measured method that was faster for one training example.                                                                                  |
| Regret            | Extra time used because the chosen method was slower than another allowed method.                                                              |
| Oracle            | A diagnostic that picks the fastest measured method after seeing all results. A real query cannot use this future information.                 |
| Holdout           | Applications or fixtures kept out of training and tuning. Use them once to check the frozen model.                                             |
| Route-only timing | Time for a method after its inputs are already available. It leaves out decision and input-collection costs.                                   |
| Integrated timing | Time for the complete query, including input collection, model decision, and result creation. Use this to decide whether a change helps users. |
| AST               | An abstract syntax tree: a structured version of source code. The benchmark uses it to change the exact route condition safely.                |
| Weak map          | A map keyed by objects that does not keep those objects alive. The inverse route uses it to mark ancestors.                                    |
| Normalize         | Rescale model inputs using values learned from the training data. Keep those values fixed for validation and testing.                          |
| Logit             | A model score before it is turned into a probability. The runtime can compare the score directly with a fixed threshold.                       |
| Validation set    | Examples used to choose model settings. Do not use them to update the model weights.                                                           |
| Test set          | New examples used once to check the final frozen model. Do not tune the model after viewing these results.                                     |
| Hidden layer      | The part of a neural network that transforms inputs before the model makes a choice.                                                           |
| ReLU              | A function that changes negative values to zero and keeps positive values.                                                                     |
| Epoch             | One training pass over all selected examples.                                                                                                  |
| Checkpoint        | A saved copy of the model weights at one point in training.                                                                                    |
| Scalar JavaScript | Generated code that uses individual numbers instead of temporary arrays.                                                                       |

## Problems to fix before trusting the model results

The following findings come from reading the source and measurement tools.
They are not new performance measurements.

### The forward benchmark can execute the inverse route

The built runtime contains this complete rejection condition:

```js
if (
  witnesses.length > anchors.length * 2 &&
  (!plan.denseInverse ||
    anchors.length > 192 ||
    witnesses.length > anchors.length * 4)
) {
  return null
}
```

`scripts/repo/bench/planner/has/variants.mts` currently substitutes `true` for
only `witnesses.length > anchors.length * 2`. For a dense plain-class case
inside the retained bounds, the remaining expression is false. The supposed
forward variant therefore continues into inverse marking. This contaminates
the meaning of the training labels. Comparing selector results alone cannot
find this problem because both strategies are supposed to return the same
results.

### The reconstructed baseline differs from production

`production_inverse()` in `neural/train.py` grants the dense inverse preference
to attribute masks 0 and 3. Production grants it only when
`plan.denseInverse` is true. That flag establishes that both compounds are
single class seeds. Neither “no attributes” nor an attribute mask is an
equivalent condition. A bare type and a compound with two classes can have
mask 0 without qualifying.

The exporter also drops `row.costs[0]`, which is the directly measured current
runtime, and reconstructs baseline costs from a forced route. Keep the actual
baseline measurements in the replacement dataset.

### Evaluation and exported fallback differ

The Python evaluator falls back to `production_inverse()`. The generated
`chooseInverse()` falls back to the older `witnesses <= anchors * 2` rule.
The standalone inference benchmark has another handwritten baseline. Fix
their shared contract before trusting agreement or timing results.

### The available inputs hide structural differences

The October 4 dataset has 112 cases per host but only 27 distinct input vectors
per host. The input is anchor count, witness count, attribute mask, ratio, and
host encoding. DOM arrangement is absent. In the recorded Chromium filtered
cases, the identical input `[32, 128, 3, 4]` favors forward on a flat fixture
and inverse on an irregularly nested fixture. Those filtered cases do take
different forced routes under the existing modifier, but their old timing
numbers still need independent confirmation.

A model must return the same answer for identical inputs. Extra epochs cannot
teach it an unavailable fact. Do not add fixture name, family, selector text
identity, or holdout membership as a feature to make this problem disappear.

### Inference is currently a generic interpreter

The generated model allocates intermediate arrays and uses `map`, `reduce`,
three `log1p` calls, and two `tanh` calls for its selected two-unit network.
The reported roughly 226ns is the cost of that implementation on its recorded
Node microbenchmark. It is not a lower bound on neural inference. Conversely,
optimizing that microbenchmark alone does not prove a query improvement.

## File map

Paths below are relative to the v3 checkout. “New” means a proposed file.
Keep helpers short and give entrypoints `isMainModule` guards and `--help`.
Follow the existing naming, complexity, formatting, and test-tier conventions.

| File                                              | Responsibility                                         |
| ------------------------------------------------- | ------------------------------------------------------ |
| `src/core/select/has/match.mts`                   | Current bulk preparation, routing, marking             |
| `src/core/select/all.mts`                         | `runSingle` invokes bulk path and normal fallback      |
| `src/core/match/relative.mts`                     | Existing witness collection and exact existence search |
| `src/core/compile/guards.mts`                     | Existing fixed predicate ordering                      |
| `src/core/compile/resolver.mts`                   | Resolver compilation and cache integration             |
| `src/core/state/types.mts`                        | `BulkHasPlan` and query plan types                     |
| `scripts/repo/bench/planner/has/variants.mts`     | Benchmark bundle modification                          |
| `scripts/repo/bench/planner/has/run.mts`          | Collection orchestration and provenance                |
| `scripts/repo/bench/planner/has/fixtures.mts`     | Existing synthetic and page fixtures                   |
| `scripts/repo/bench/planner/measure.mts`          | Shared browser and `jsdom` timing                      |
| `scripts/repo/bench/planner/compare.mts`          | New pure evaluation math, if needed                    |
| `scripts/repo/bench/planner/has/contract.mts`     | New benchmark route contract and vectors               |
| `scripts/repo/bench/planner/has/instrument.mts`   | New AST edits and untimed route evidence               |
| `scripts/repo/bench/planner/neural/export.mts`    | Measurement to training dataset conversion             |
| `scripts/repo/pytorch/neural_train.py`     | Retired PyTorch training entrypoint                    |
| `scripts/repo/pytorch/adaptive_data.py`    | Training data loading and feature encoding             |
| `scripts/repo/pytorch/adaptive_policy.py`  | PyTorch model and JavaScript export                    |
| `scripts/repo/bench/planner/neural/evaluate.py`   | New metrics and model selection helpers                |
| `scripts/repo/bench/planner/neural/oracle.mts`    | New diagnostics using recorded measurements            |
| `scripts/repo/pytorch/neural_parity.py`   | PyTorch versus JavaScript parity check                 |
| `scripts/repo/bench/planner/neural/parity.mts`    | JavaScript parity check                                |
| `scripts/repo/bench/planner/neural/inference.mts` | Standalone decision overhead diagnostic                |
| `scripts/repo/bench/planner/neural/confirm.mts`   | New integrated candidate confirmation                  |
| `scripts/repo/bench/planner/neural/report.mts`    | Generated HTML from recorded results                   |
| `scripts/repo/bench/planner/adaptive/`            | Experimental continuation collection and evaluation  |
| `docs/repo/perf/journal.md`                       | Commands, outcomes, limitations, commit references     |

Do not create every proposed file immediately. Create each when its owning
phase needs it. In particular, split the existing long Python trainer by
responsibility while changing it, rather than growing one large entrypoint.

## Phase 0: Keep the old evidence and label its limits

This phase protects the old files and prevents the new trainer from using
measurements with incorrect route labels. Keep the old data for reference.
Do not present it as valid training data.

Files: this guide's companion status, `trained-has-planner.md`, the neural
report generator, its generated HTML, and the existing training guide HTML.

1. Preserve the raw October 4 artifacts, fixture archive, model, hashes, and
   old evaluation JSON. They document what actually ran.
2. Add a visible correction identifying the three routing problems above.
   Mark the October 4 neural comparison as superseded for performance
   conclusions. Do not silently rewrite its data as if it had been collected
   under the corrected harness.
3. Scope the correction to this neural comparison. The October 3 independent
   comparisons of actual baseline and candidate builds are separate evidence.
   Do not withdraw or reaffirm them based only on the newer harness bug.
4. Add an explicit schema/version rejection to the new training loader. Old
   data can be opened by diagnostic scripts, but cannot enter new training
   implicitly. New runs use a new directory, such as
   `assets/repo/bench/planner-neural-2026-10-05-r1/`.
5. Replace package scripts that overwrite date-stamped October 4 data with
   explicit input/output arguments or a run directory passed to a wrapper.
   A collector must refuse a nonempty output directory unless resuming an
   incomplete manifest with matching hashes and disjoint row IDs.

Acceptance: the old result is clearly marked, old raw inputs are unchanged,
and the corrected pipeline cannot accidentally consume them as valid labels.

## Phase 1: Define one shared route rule

Python, generated JavaScript, and the runtime must agree on when each route
is allowed. Write the rule once in clear terms, then test its boundary values.

Create `has/contract.mts`. It is a development helper, not a new runtime import.
Export named types, a reference decision, and deterministic boundary vectors.
Use readable names instead of a boolean that silently means different routes
at different call sites.

```ts
type Route = 'forward' | 'inverse' | 'empty' | 'ineligible'

interface RouteFacts {
  eligible: boolean
  anchors: number
  // Null means the runtime has not paid to fetch witnesses.
  witnesses: number | null
  denseInverse: boolean
  weakMapAvailable: boolean
}
```

Use this semantic order for the reference:

1. Ineligible syntax, callback, host, or context: `ineligible`.
2. Fewer than 32 anchors: `forward`. Do not demand a witness count.
3. Otherwise a real nonnegative witness count is required for this reference.
   Missing or invalid data is a collection error, not an empty result.
4. Zero witnesses: `empty`.
5. If `W > 2*A` and `(!denseInverse || A > 192 || W > 4*A)`, `forward`.
6. If the inverse route cannot create its weak map, `forward`.
7. Otherwise `inverse`.

Record `denseInverse` from the actual prepared plan in the untimed probe.
Record syntax and host eligibility separately. Do not derive it from the
attribute mask, selector first character alone, or the fixture name.

The reference helps detect drift. The executed unmodified runtime is the
authority and supplies baseline timing. Cross-check reference decisions with
observed execution rather than trusting the reference by itself.

Export JSON vectors for Python containing input facts and expected route.
The Python implementation must pass every vector before training starts.
The emitted JS decision accepts the same fallback identity and applies the
same domain rules as Python. It must never return an empty answer from a
prediction. Only an exact witness preflight may select `empty`.

Boundary vectors must include:

- Anchor counts 0, 1, 31, 32, 33, 191, 192, and 193.
- Witness counts 0, 1, `2*A-1`, `2*A`, `2*A+1`, `4*A`, and `4*A+1`.
- Dense flag true and false at each meaningful boundary.
- Plain classes, both filtered compounds, one filtered compound, bare types,
  and multiple-class compounds. Cover masks 0, 1, 2, and 3.
- Missing weak-map support, ineligible syntax, callback use, XML, and a
  document fragment. Observe actual support instead of assuming a fragment
  always takes one route.
- Nonfinite numbers and negative counts as invalid input tests for model APIs.

Create meaningful tests under
`test/repo/unit/bench/planner/has/contract.test.mts`. The file mirrors the
script owner under the repository's test tier. Include a Python parity runner
using the existing environment. Do not test documentation wording.

Acceptance: JS reference, Python fallback, generated model fallback, and
observed runtime behavior agree on eligible boundary vectors. Cases that exit
before the planner are explicitly classified and never treated as inference.

## Phase 2: Make the benchmark run the route it names

The benchmark must prove that its forward variant ran forward and its inverse
variant ran inverse. Matching results alone cannot prove that. Add evidence
outside the timed code and reject a benchmark edit when the source shape is
ambiguous.

Change `has/variants.mts`; add `has/instrument.mts` if needed.
Use the existing pinned `acorn` parser, or the repository's existing compatible
AST parser, to find `selectBulkHas` in the readable CommonJS build. At the
audited revision it is a named function declaration. Find its complete route
`IfStatement` by structure. Require exactly one match in that function.

Use AST byte offsets to replace the complete condition or statement. Apply
multiple edits from highest source offset to lowest. If the build shape no
longer matches the expected structure, fail with a descriptive error. Do not
guess at another occurrence or edit only the first comparison again.

Produce these variants from the same immutable baseline bytes:

| Variant                   | Behavior                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `baseline`                | Original build, byte-for-byte unchanged                                                      |
| `forward-after-preflight` | Preserve small-anchor and empty-witness exits; reject inverse at the complete routing branch |
| `inverse-after-preflight` | Preserve the same exits and capability fallback; bypass the complete cost rejection branch   |

The route label intentionally says `after-preflight`. Both forced routes still
pay for the global witness lookup that precedes the branch. They cannot answer
whether skipping that lookup would be faster. Phase 8 addresses that question.

Create separate instrumented twins for evidence, not timing. Counters or an
event log must establish:

- Whether `selectBulkHas` was entered.
- Whether it exited for small anchors or zero witnesses.
- The facts seen at the decision, including `denseInverse`.
- Whether forward fallback was requested and the ordinary resolver ran.
- Whether inverse marking was actually entered.
- Whether a missing map caused fallback.

Use the same AST edit builder for timed and instrumented variants. Their only
difference is the instrumentation. Assert behavior in both `jsdom` and Chromium
on representative fixtures. An existing probe that merely confirms the routing
condition was reached does not establish which route executed.

Regression fixture: at least 32 and at most 192 anchors, exactly four witnesses
per anchor, both compounds single classes. On this case, forced forward must
record forward execution and zero inverse entries. Forced inverse must record
inverse execution. This directly detects the partial-substitution defect.

Also exercise a zero-witness fixture and fewer-than-32-anchor fixture. Their
two forced variants share the same early exit. Mark them as controls with no
meaningful route label for training. Preserve them for total query regression
measurements.

Before and after timing, compare ordered element identity to an independent
reference in each DOM instance. Compare references within the same document,
not elements from two different cloned documents. Existing comparison helpers
already use this pattern. Use native Chromium and appropriate `jsdom` reference
paths; do not accidentally call the candidate through an installed adapter.

Add integration coverage under
`test/repo/integration/bench/planner/has/variants.test.mts` and appropriate
browser coverage. Assert behavior and parsed structures, not literal bundle
source strings. Do not add instrumentation flags to the published API.

Acceptance: route evidence proves the two strategies differ when eligible,
all variants preserve exact results, and a deliberate ambiguous AST match
fails loudly. Freeze the variant hashes before any measurement collection.

## Phase 3: Save each measurement with its context

Save the selector, fixture, host, build hashes, input facts, route evidence,
and every timing round together. This lets another developer check where a
number came from and prevents old data from entering a new experiment.

Change `measure.mts`, `has/run.mts`, and `neural/export.mts`. The generic measure
helper also supports other planners. Preserve their feature computation and
contracts. Prefer an optional structured metadata extension or a has-specific
wrapper over rewriting unrelated experiments.

Use a new dataset format, with named fields. This is a minimum example:

```ts
interface PlannerRow {
  id: string
  groupId: string
  family: string
  split: 'train' | 'validation' | 'test'
  host: 'chromium' | 'jsdom'
  scenario: 'warm-all' | 'cold-selector' | 'mutation-sequence'
  selector: string // Metadata only; never directly an input feature.
  fixtureSha256: string
  eligible: boolean
  decisionReached: boolean
  observedBaselineRoute: Route
  features: {
    anchors: number
    witnesses: number | null
    denseInverse: boolean
    anchorAttribute: boolean
    witnessAttribute: boolean
  }
  measurements: {
    baseline: Timing
    forwardAfterPreflight: Timing
    inverseAfterPreflight: Timing
  }
}

interface Timing {
  medianNs: number
  rounds: Array<{ round: number; ns: number; calls: number }>
}
```

Also record schema version, route contract version/hash, collector commit,
build and variant hashes, fixture manifest hash, host versions, CPU/platform,
timing settings, seed, start/end timestamps, and power snapshots. Preserve raw
round records. State that `jsdom` currently records round medians while the
native browser collector has its own timing statistic. Do not call both the
same statistic without actually changing and documenting the collector.

Export the actual baseline cost and samples. Validate unique case IDs,
positive finite timing values, round counts, matching host fixtures, and
variant order. Reject a mismatch with its offending field and file.

Keep `witnesses: null` when the runtime never fetched the collection. Zero is
a real exact observation and must not mean “unknown.” Retain exact counts as
metadata if an untimed diagnostic computed them, but identify them separately
as unavailable to that runtime decision.

Feature availability is part of the contract. A feature produced by an extra
lookup is not free because it was recorded outside timing. Charge that lookup
in every integrated candidate that uses it.

### Freeze the experiment before collection

Write `experiment.json` in the new artifact directory before reading results.
It contains the variants, features, split manifest, metric definitions, model
grid, promotion gate, collection order seed, and run settings. Hash it into all
outputs. A design change starts a new experiment version.

Use 11 rotating rounds of at least 20ms per variant for the initial collection.
Run on AC when requested by setting `NWSAPI_REQUIRE_AC=1`. The existing helper
checks power at run boundaries on macOS. It does not continuously monitor
power, and it fails closed on other platforms. Report these limits.

Do not run two benchmark hosts or separate CPU-heavy jobs simultaneously.
Parallel file inspection is fine. Training and benchmarking should be
sequential to reduce interference. Save completed host results promptly.

### Make the commands safe to reproduce

Existing commands can be used with an explicit new directory after repair:

```sh
pnpm run build
NWSAPI_REQUIRE_AC=1 NWSAPI_PLANNER_ROUNDS=11 NWSAPI_PLANNER_MILLISECONDS=20 \
  node scripts/repo/run.mts scripts/repo/bench/planner/has/run.mts \
  collect assets/repo/bench/planner-has-2026-10-05-r1

node scripts/repo/run.mts scripts/repo/bench/planner/neural/export.mts \
  assets/repo/bench/planner-has-2026-10-05-r1 \
  assets/repo/bench/planner-neural-2026-10-05-r1
```

These directory names are examples. Pick a fresh run ID if they already exist.
Do not run the old package convenience commands while they still hardcode the
October 4 directories. Update the entrypoint documentation with the final CLI.

Acceptance: one small pilot can be reproduced from its manifest, route
evidence and identity checks pass, and no old artifact has been overwritten.

## Phase 4: Check whether a decision could save enough time

Before training, compare each exact route and estimate the best possible
saving. Include the cost of collecting inputs and running the decision. If
even a perfect decision cannot meet the frozen target, do not spend time
searching for a larger model.

Create `neural/oracle.mts`. Use training/development rows for this diagnostic.
The already examined October 4 holdout is development history now. New final
test groups must remain unopened until the candidate and its settings freeze.

For each valid row, keep these separate quantities:

```text
B = directly measured baseline query time
F = measured forward-after-preflight query time
I = measured inverse-after-preflight query time
O = min(B, F, I)
```

Including `B` permits leaving the original implementation alone. An oracle
choosing between timing variants of the same effective route can exploit
measurement noise. Flag route aliases, report their count, and provide a
second conservative diagnostic that treats equivalent choices as baseline.
Neither diagnostic proves a realizable gain.

Produce three levels of diagnostic:

1. **Full-information optimistic oracle.** Pick the cheapest eligible strategy
   per row with hindsight. This estimates headroom among measured strategies.
   It does not include inference or feature acquisition. Restrict it to valid
   action rows and keep bypass controls separate.
2. **Current-input empirical oracle.** Group rows by host and the exact features
   a candidate may actually read. Pick one action for each group. For an
   equal-case geometric objective, choose the action minimizing the sum of log
   costs in that group. For total workload time, minimize frequency-weighted
   cost. Report both if frequencies are known. This is an optimistic fit to
   observed groups, not a model tested on unseen applications.
3. **Additional-observation empirical oracle.** After phase 8 records useful
   execution observations, repeat the grouping using those features and their
   full pipeline costs. Until then mark this diagnostic unavailable. Do not
   fabricate a structure-aware oracle from fixture names.

For continuous features, exact groups often contain one observation. Report
group sizes and singleton fraction. Also show a predeclared coarse grouping
as a sensitivity check. A singleton-rich empirical oracle is a weak diagnostic
of generalization, not proof that the features suffice.

Use these output metrics for each host and scenario:

```text
geometric speed ratio = exp(mean(log(B_i / C_i)))
query time reduction = 1 - 1 / geometric speed ratio
worst case time ratio = max(C_i / B_i)
absolute saving for case i = B_i - C_i, in ns
weighted workload saving = sum(frequency_i * (B_i - C_i))
```

Do not treat synthetic case counts as real application frequencies. Report
equal-case and equal-application summaries explicitly. Bootstrap applications
or fixture groups for workload uncertainty, and paired rounds within cases
for timing uncertainty. These are different sources of uncertainty.

Paired resampling must use the same round IDs for baseline and candidate.
When both choices refer to the same recorded baseline, use exactly the same
sample rather than manufacturing a confidence interval by independently
resampling it twice. Rotate measurement order as the current collectors do.
The forced variants are not literally simultaneous paired measurements;
describe the rotation and matching rounds accurately.

Write per-case absolute headroom and break-even overhead. A case with only
20ns of optimistic saving cannot support 200ns of added decision work. The
condition is `feature work + decision work + switching work < work avoided`.
For repeated calls, separately include one-time compilation and profiling.

Default experimental gate, frozen before collection:

- At least 1.05 geometric speed ratio in each host on the relevant final
  scenario. This means about 4.76% less time, not exactly 5% less time.
- No individual supported held-out case above 1.15 candidate/baseline time in
  either independent confirmation pass. If noise is unresolved, report an
  unresolved gate instead of selecting the more favorable pass.
- Both aggregate and per-application results must be reported. A result driven
  by one page family needs broader confirmation before runtime promotion.
- All exact-result and compatibility checks must pass.

If the valid oracle on the present two strategies cannot meet the gate even
with free decisions, stop expanding this model's hyperparameter search. Finish
scalar export and move to the phase 8 strategy that can avoid the witness
preflight. Record the reason. Do not change the gate to make a result pass.

Acceptance: `oracle.json` and its report distinguish mathematical hindsight,
observable input limitations, and integrated evidence. A hand-calculated
two-case fixture verifies metric direction, grouping, and baseline identity.

## Phase 5: Make model decisions cheaper

This phase keeps the existing weights fixed and tests less costly JavaScript
for the same decision. A faster decision microbenchmark does not count as a
query improvement; measure complete queries too.

This phase isolates export overhead. It does not retrain the model or claim
that its old route labels were correct. Keep the old generic evaluator as a
development reference, and label this a parity/overhead experiment.

### Step A Emit scalar operations using the same weights

The existing network has normalized inputs, one `tanh` layer, and two outputs.
Emit one local variable for every input and hidden unit. Emit explicit sums
in the original order. Eliminate intermediate arrays, `map`, `reduce`, and
callback closures. Do not construct a feature vector in the query path just
to call the generated function.

For the first parity version, retain input transforms, normalization,
activation, output summation order, and fallback behavior. Use scalar
parameters or fields already present on the plan. Count allocations in the
source and check the emitted function behavior. Do not infer heap behavior
from source alone when making a measured allocation claim.

Export both the reference and scalar decisions from development artifacts.
Generate expected predictions and decisions in Python for the training rows,
validation rows, deterministic boundary vectors, and a seeded random grid.
Use at least 10,000 random inputs within and just outside the learned domain.
Compare Python predictions to generic JS with a stated float tolerance, then
generic JS to scalar JS. Guard against `NaN`, infinity, negative counts,
unknown host, and unsupported flags before model arithmetic.

### Step B Fold constants as a separate variant

For first-layer weights `w_jk`, normalization mean `mu_k`, scale `s_k`, and
bias `b_j`:

```text
old hidden input = b_j + sum(w_jk * (x_k - mu_k) / s_k)
folded weight v_jk = w_jk / s_k
folded bias a_j = b_j - sum(w_jk * mu_k / s_k)
new hidden input = a_j + sum(v_jk * x_k)
```

The equation is algebraically equivalent but floating-point reassociation can
move a threshold decision. Treat that as a parity concern, not as exact
bit-for-bit equivalence. Use a predetermined small numerical uncertainty band
around the decision boundary and fall back consistently inside it in Python
and JS. Derive and freeze the band from export verification, without viewing
final performance holdout labels. Report disagreement counts before and after
the guard, maximum output error, and the resulting fallback count.

For fixed selector and host features, fold their contribution into the bias
once per prepared plan. Do not add user-agent detection. The adapter or
benchmark already knows its host capabilities. Start with separate explicitly
selected host exports for the experiment, and a generic fallback for other
hosts. Production host selection needs an explicit capability contract.

If decisions use only the difference of the two predicted costs, combine the
two output rows into one scalar difference. Preserve the exact margin and
tie semantics. A zero difference is not evidence that inverse wins. Do not
replace the existing three-way comparison with an unverified sign test.

Log transforms still cost time. Keep them in this same-model comparison.
Removing them or replacing `tanh` with ReLU changes the model and belongs to
phase 7, which retrains it.

### Step C Benchmark realistic decision calls

Change `neural/inference.mts` to rotate a seeded array of different inputs,
including valid decisions, guard exits, and boundary cases. Consume a checksum
so the work cannot be discarded. Use the same function-call shape for the
baseline and model. Warm both and rotate their timing order.

Report generic, scalar, and folded-scalar timings separately in Node and
Chromium. Record code bytes and the host/version for each. The old benchmark
uses one constant in-domain tuple, which is not enough to estimate general
dispatch cost. Keep decision-only results labeled as diagnostics.

Finally, insert the selected scalar decision into an experimental bundle
derived from the unchanged baseline. Measure whole queries against the actual
baseline on development data. Do not add a Node nanosecond estimate to browser
query medians and call it an integrated result.

Acceptance: decision parity is proven across the declared domain, there are
no per-decision feature/output arrays, and both overhead and whole-query costs
are recorded. A slower scalar candidate is retained only as evidence, not
selected for runtime use.

## Phase 6: Add useful test pages and selector cases

The training set must include pages where the best route changes for a known
reason. Keep related cases together when splitting data, so a near-copy of a
training page does not leak into the final test.

Extend fixtures in a has-specific module and save a manifest. The objective
is to cover changes in relative route cost while keeping the input facts
honest. Do not create a huge Cartesian product of every dimension.

Begin with the existing 112 fixtures as regression/development cases. Add
deterministic structural pairs and boundary cases. Each pair holds anchor
and witness counts constant while changing one causal property:

- Flat anchors versus nested anchors.
- Witnesses spread across anchors versus concentrated under a few anchors.
- Witnesses inside anchor subtrees versus outside every anchor subtree.
- An early qualifying witness versus the last candidate qualifying.
- Candidate witnesses that mostly fail attribute predicates versus mostly
  pass them.
- Short shared ancestor paths versus deep, mostly disjoint paths.
- Equal anchor counts with many tiny subtrees versus a few very large ones.

Candidate counts are seed counts before compound predicates. Do not confuse
`.card[data-ok]` matches with the number of `.card` seed candidates.

Default size levels for exploration are 8, 31, 32, 33, 192, 193, 512, and
2048 anchors. Use witness ratios 0, 0.125, 1, 2, 2 plus one witness, 4, and 8
where construction is practical. Include a few 8192-anchor stress cases
separately. Stress cases do not get to dominate the ordinary workload score.

Cap the first generated suite at 256 cases per host, including existing
cases. Use seeded stratified sampling to select combinations. Record omitted
combinations and the seed. Include masks 1 and 2, which the old synthetic
suite omitted. Include single classes, bare types, multi-class compounds,
and attribute-filtered compounds while retaining current syntax eligibility.

### Application and sequence data

Add at least six independent page/application groups for a pilot, with at
least three additional unseen groups reserved for final confirmation. This
is a pilot size, not evidence of broad web coverage. Public checked-in HTML
fixtures are acceptable if their provenance, license, and workload selection
are recorded. A generated component page must be labeled synthetic.

Prefer actual selector call traces when available. If you extract selectors
from stylesheets or hand-select queries, say so. A stylesheet's selectors
are not automatically representative of JavaScript query frequency.

For each suitable page, define deterministic sequences:

- Repeated queries without mutation.
- Attribute/class changes that change which elements match.
- Moving an existing witness between anchor subtrees.
- Adding/removing anchors and witnesses.
- Reparenting a subtree while keeping total counts constant.
- Switching between document and element contexts where supported.

Represent mutations as replayable operations using stable fixture IDs or
construction handles. Do not use the candidate selector engine to find the
elements that define expected mutations. Record results before and after
each operation. Every strategy runs on an equivalent freshly initialized
sequence with the same warmup schedule.

For warm cases, compare steady query time. For cold-selector cases, use fresh
engines and measure the first call, explicitly stating whether engine setup
is included. For sequence cases, report query-only and full-sequence costs
separately. Never subtract noisy setup estimates and present the result as
a directly measured cost.

### Split rules

Use explicit `train`, `validation`, and `test` groups. Keep every selector,
mutation state, synthetic seed sibling, and both host versions from the same
application/group in the same split. Deterministically hash stable group IDs
with a committed seed and save the resulting manifest before timings.

Tune features, architecture, thresholds, and epochs using training and
validation only. Compute normalization and domain limits from training only.
Validation-domain misses are real fallback observations, not a reason to
expand the domain using validation values. Once a final test has informed a
design revision, relabel it as development history for that next revision
and obtain a fresh final test. Never silently recycle an examined holdout.

Acceptance: there are conflicting-structure pairs, realistic page sequences,
untouched application groups, and an explicit availability/cost description
for every feature.

## Phase 7: Train a model to choose between query methods

Train only after the allowed methods, inputs, and dataset are defined. This is
supervised learning: the trainer learns from examples that contain inputs and
measured costs. Select a model by query time on validation pages, not by how
often it guesses the training labels.

Use PyTorch in the existing locked environment. Start with a small supervised
policy. All available actions can be measured offline, so this stage does not
need online reinforcement learning or exploration in user queries.

### Inputs for the first new model

Use raw scalar counts normalized by training-only mean and scale, two
attribute-presence flags, the exact dense eligibility flag, and explicit host
encoding. A ratio is optional only as a named ablation with its division cost
included. Static flags and host encoding can be folded during export.

Use separate flags for anchor and witness attributes. Do not collapse masks
1, 2, and 3 into one truthy feature. Metadata such as DOM depth or family may
explain results in reports but cannot become an input unless the runtime
actually acquires it within the measured budget.

Later, train the adaptive model on phase 8 observations. Keep its schema and
weights separate from this initial routing model. Do not fill missing
observations with zero unless a separate availability flag distinguishes that
state and training includes it.

### Network and search budget

Use one hidden layer with ReLU and one output logit. A logit is a score with no
fixed upper or lower bound. Positive values can favor the alternative method;
zero is undecided. Training can use sigmoid. At runtime, compare the logit
with a fixed threshold and skip the extra exponential calculation.

Use hidden sizes `[2, 4, 8]` and seeds `[20261005, 20261006, 20261007]`.
Use AdamW, initial learning rate `0.01`, weight decay `0.01`, at most 1000
epochs, and early stopping after 50 validation checks without improvement.
These are starting experimental settings, not claims of optimality. Record
them in the manifest. One deliberate follow-up grid is allowed if development
evidence identifies a specific training failure. Do not keep searching after
the headroom or integrated-cost gate fails.

Use CPU training for repeatability at this scale and record thread count,
framework version, and seeds. Existing pinned PyTorch supports this. GPU
training is a separate benchmark if dataset size later warrants it.

### Loss and decision policy

For a row, let `C0` be the measured total cost of keeping the existing strategy
and `C1` the total cost of the alternative, including any prefix and switching
cost measured for that alternative. Where costs are only route measurements,
add a separately documented development overhead estimate for training and
label the result estimated. Final acceptance still uses integrated timing.

Train a binary preference that gives more weight to expensive mistakes. Use
PyTorch's stable `BCEWithLogits` loss. It measures how far the model's score
is from the measured preferred method:

```text
winner = 1 if C1 < C0 else 0
relative gap = abs(C1 - C0) / max(C0, C1)
case weight = group weight * relative gap
loss = weighted BCEWithLogits(logit, winner)
```

Give each application equal total training weight by default. If measured
query frequencies exist, run a separately labeled frequency-weighted model.
Do not let a large generated family silently dominate the loss. Give cases
where the alternative regresses by more than 15% an additional fixed 2x
weight. Freeze that penalty in the manifest.

Use paired timing rounds to identify unresolved ties. If a 95% interval for
the cost difference includes zero, mark the case unresolved. It contributes
no directional classification gradient, but remains in validation and final
performance summaries. All rows remain visible in artifacts. The default
tie decision is the existing strategy.

Use validation total query time to select checkpoints and thresholds, not
training BCE or route-label accuracy alone. Try probability thresholds
`[0.5, 0.6, 0.7, 0.8, 0.9, 0.95]` offline and export their logit equivalents.
Choose the candidate with the best validation geometric time that satisfies
the regression gate. Prefer a smaller model, then fewer decisions, on ties.
If none qualifies, select baseline for all queries and record rejection.

A high logit is not automatically a calibrated probability or a guarantee of
speedup. Call it a score threshold unless calibration is separately validated.
To require a minimum absolute saving, use a trained and validated advantage
estimate or a measured eligibility bucket, not the confidence score alone.
Start with validation-derived eligibility buckets based on already available
counts and freeze their definitions before final evaluation.

An optional second loss ablation can minimize expected normalized cost:

```text
p = sigmoid(logit)
expected normalized cost = ((1-p)*C0 + p*C1) / C0
```

Run it only after the first loss is implemented and evaluated. It is a smooth
training surrogate, not the deployed stochastic policy. Deployment remains
deterministic. Avoid inventing a complex custom loss with several unmeasured
penalties at once.

### Required training outputs

Save the frozen dataset hash, split manifest, input schema, normalizer, exact
weights, domain, threshold, chosen checkpoint, validation records, and a
standard PyTorch state dictionary. Save a JSON weight export and generated
scalar JS so inference does not depend on PyTorch or Python.

The learned policy should expose “keep baseline” versus a specific eligible
alternative. A rejected or out-of-domain input returns “keep baseline.”
It does not reconstruct a stale historical routing rule. The actual baseline
implementation performs its existing exact preflight and routing.

Before final testing, freeze one chosen model and hash its module. Verify
Python, reference JS, and emitted scalar decisions using the phase 5 parity
runner. Evaluate the exported JS choices, not just Python's choices, in the
offline report. Do not regenerate weights after looking at the final test.

Acceptance: the complete training run is reproducible, fallback is identical
across languages, and model selection is based on query cost including known
decision work. The report states whether the model qualifies for confirmation.

## Phase 8: Test whether a query can change methods midway

This experiment checks whether the engine can do a little exact forward work
first, then continue forward or switch to inverse search. It may save the
early cost of collecting all witnesses. The prefix, observations, decision,
and remaining work all count toward the query time.

This is the main new research hypothesis. The current two-route experiment
starts after a global witness lookup. A model that decides earlier may avoid
that lookup or discover that forward work is expensive enough to justify it.
The possible gain comes from a different execution sequence as well as a
better choice. Measure both contributions independently.

Implement the first prototype under `scripts/repo/bench/planner/adaptive/`
as an experimental bundle. Use the AST variant builder to install the
experimental bulk implementation and any narrowly required helpers. Preserve
the unmodified build as the baseline. Keep all candidate source and generation
commands reproducible. Do not hand-edit `dist/nwsapi.js` and lose provenance.

### Scope of the first adaptive prototype

Use existing pure bulk-eligible descendant `:has()` selectors and all-results
selection only. Exclude callbacks, custom selector extensions, custom
combinators, legacy mode, and unsupported host/context cases through the
existing gates. Initially use HTML document contexts for the adaptive path.
Other contexts exercise fallback controls. Expanding support is a separate
change with dedicated evidence.

The current `BulkHasPlan` contains compiled anchor and witness plans. Add the
validated original witness argument to the experimental prepared plan if
needed for the existing exact `engine.has(argument, anchor)` implementation.
Do not reconstruct selector source from a candidate seed: the seed may omit
attribute predicates. Retain normal parsing and validation before any early
answer, including invalid branches and forgiving-selector behavior.

No stateful pseudo-class is added to this first prototype. The existing
`pureCompound` restriction already narrows the grammar. Preserve it and the
extension-generation checks. Reordering arbitrary user callbacks or extension
predicates is not part of the experiment.

### First implement an exact resumable forward loop

Build a helper that can process anchors `[start, end)` and append matches to
one result array. Test the anchor predicate and then use the existing exact
witness existence semantics. Process candidate anchors in their existing
document order. Match-only compiled predicates use the matcher callback
signature in `src/core/select/has/match.mts`; collection resolvers in
`src/core/select/all.mts` use a different calling convention.

Before adding a model, compare this helper against the unmodified forward
resolver. If it introduces substantial overhead, improve or reject the helper
before collecting thousands of labels from it. Its cost is part of the
adaptive policy, even when it makes no learned decision.

Keep `nextAnchor` as the first unprocessed anchor index. A rejected anchor
counts as processed. A matching anchor is appended exactly once. If the helper
returns early, its result array and index are sufficient to resume. It must
not return partial results through the public API.

### Execute a short prefix before acquiring global witnesses

Run this pipeline for an eligible candidate:

```text
Acquire the normal anchor candidates.
If fewer than 32 anchors: use the ordinary path.
Process the first K anchor candidates with exact forward matching.
If all anchors are processed: return the complete results.
Read observations already produced by that work.
Choose continue-forward or switch-to-inverse exactly once.
Finish the remaining anchors with the chosen exact strategy.
Return the complete ordered results.
```

Try `K` in `[2, 4, 8]` on development/validation data only. Start implementation
with `K=4`. Never pick K separately for each final test fixture. Include the
no-prefix baseline and a prefix-plus-fixed-choice control so a win is not
misattributed to the neural model.

A fixed number of processed anchors does **not** bound runtime. A single DOM
lookup may walk or copy a large collection before returning. Do not claim
bounded execution time or attempt to interrupt opaque browser DOM methods.
Record this risk through adversarial large-first-anchor fixtures. A later
explicit traversal budget requires a different interruptible algorithm and
its own measurements.

### Observe useful work cheaply

The first version may read only:

- Anchor count already known from the existing candidate collection.
- Number of anchor candidates processed and number passing the anchor filter.
- Number of exact matches found in the prefix.
- Selector and host flags already available on the plan.

An additional version may record candidate collection lengths and failed
witness predicate attempts from the prefix search, provided that the actual
candidate code already performed those operations. Add an optional local
observation accumulator to the experimental prefix helper, with updates only
where values already exist. Include those updates in timed candidate code.
Avoid allocating an observation object for every anchor.

Do not instrument every normal engine call just to support a few adaptive
cases. The prototype must keep observation work within the eligible prefix.
Do not add `performance.now()` to individual element visits. Count coarse
work where it is available, and charge those counts in integrated timing.

Diagnostic-only counters may record more expensive facts, such as ancestor
overlap, in separate untimed runs. Such facts may explain failures but are
not runtime features. A model using them would be a different experiment.

The first K anchors can be unrepresentative. Train and evaluate fixtures with
an easy prefix followed by hard work and the reverse arrangement. Retain
fallback controls. Do not sample random anchors out of order in version one:
that requires another ordering/merging policy and changes the work contract.

### Finish forward without repeating the prefix

Continue the same exact helper at `nextAnchor`. Reuse the result array.
Do not run the original full query again. The prefix already answered those
anchors and paid their costs. Count full-query restarts separately if a
temporary prototype uses them, and exclude such a prototype from claims
about successful continuation reuse.

### Switch to inverse without duplicating results

1. Fetch global witness candidates only now, when the decision selects inverse.
2. If the collection is empty, all remaining anchors fail for this eligible
   pure descendant query. Preserve any already computed prefix results. Under
   a stable standard DOM this should be consistent with the prefix evidence.
   Assert consistency in diagnostics; never discard valid prefix results.
3. Obtain the weak map. If unavailable, resume forward at `nextAnchor`.
4. Run the existing exact witness predicate and ancestor marking semantics.
   Stop ancestor marking at the original context and at already marked nodes.
5. Iterate only anchors from `nextAnchor` through the end, in their original
   order. Apply the same anchor predicate and append qualifying marked anchors.
6. Return the complete result array. Do not sort or deduplicate an already
   unique ordered anchor list as an extra final pass.

A witness that is itself an anchor does not satisfy descendant `:has()` for
that element solely by matching itself. Preserve `markAncestors` beginning at
the parent. Nested anchors can legitimately match the same witness. Do not
stop marking after the first matching anchor, which would lose outer matches.

After processing any prefix, a capability failure must resume forward rather
than return `null` to `runSingle`, which would restart all anchors. A `null`
return before any prefix work retains the original fallback meaning.

### Collect continuation training labels

For each fixture and fixed prefix setting, execute complete comparable
pipelines in independent equivalent DOM instances:

| Action          | Timed pipeline                                                         |
| --------------- | ---------------------------------------------------------------------- |
| Original        | Unmodified production build                                            |
| Prefix continue | Prefix, observations, forward suffix                                   |
| Prefix switch   | Same prefix and observations, witness lookup, marks, inverse suffix    |
| Fixed guard     | Prefix, observations, simple count or prefix-hit rule, selected suffix |
| Neural          | Prefix, observations, real scalar inference, selected suffix           |

The forced prefix actions produce training labels. The prefix observations
must agree across them. A mismatch means the shared work differed and the row
must be rejected. Measure full pipeline totals directly. Do not estimate
switching cost by subtracting two unrelated noisy timings. For very small
differences, classify the comparison as unresolved.

The simple controls must be meaningful. Compare always continue, always switch,
the current density policy once counts are available, and one or two frozen
prefix-hit thresholds selected using validation. A model earns its added
complexity only when it improves on these controls in integrated measurements.

Train a new phase 7 model with the continuation input schema and total costs.
Evaluate exact exported decisions. Initially allow at most one strategy switch
per query. Multiple mid-query switches multiply implementation risk and
training complexity before there is evidence they are useful.

### Required adaptive correctness coverage

Test no matches, all matches, only-prefix matches, only-suffix matches,
nested anchors, witness equal to an anchor, external witnesses, deep shared
ancestors, filtered witnesses, failed anchor predicates, and missing weak maps.
Test the split at K-1, K, and K+1 relevant positions. Compare full ordered
element identities, not only lengths.

Run the same cached selector before and after class/attribute changes,
reparenting, removing a witness, and replacing the query context. Add callback,
legacy, XML, fragment, custom extension, and first-result controls that prove
the adaptive route is bypassed where promised. Reuse the existing has,
relative-has, compiler-port, and adapter fixtures where practical.

Acceptance: the adaptive implementation answers every supported case exactly,
prefix work is reused, observation and inference cost are included, and an
integrated candidate beats its simple controls and the original gate. If it
does not, record the failed hypothesis and keep the prototype offline.

## Phase 9: Reuse a route choice only when repeat queries repay its cost

Cache only a hint about which exact method to use. Never cache matches or a
claim that a witness is absent. A stale hint may be slower; a stale answer can
be wrong.

This phase is conditional. Implement it only if phase 8 or a compile-time
model has a measured useful decision whose repeated cost is material. If the
uncached policy does not have a useful decision, record “not justified by
measurements” and finish reporting. That is a completed decision, not a
request for more user approval.

Start with specialization of static inputs: selector shape, predicate kinds,
query mode, and host capabilities. Fold these once during plan preparation.
This requires no DOM result cache. Measure cold preparation and warm execution
together over realistic repetition counts.

If DOM-informed plan hints are still justified, use a small bounded cache
associated with the existing engine/plan lifecycle. Key context identity
weakly and include selector/plan generation and supported query mode. Keep
per-context entries bounded, for example a development cap of 64, and record
the cap as part of the experiment. Reuse existing bounded cache machinery
where possible rather than creating an unbounded map.

Only cache a route hint or scalar statistics. Do not keep result collections,
witness maps, match booleans, live DOM collections, or DOM-element feature
arrays across calls. A stale choice between two exact algorithms may be slower
but both still answer the current DOM. A stale “no witnesses” assertion would
change correctness and is forbidden.

Avoid adding a global MutationObserver merely to maintain performance hints.
The ordinary API must see synchronous mutations immediately. A mutation
observer callback does not run synchronously after every mutation. Correctness
must come from executing the exact current query, not from an assumed cache
invalidation notification.

Start with a fixed reuse count of 8 eligible calls, then re-evaluate on useful
prefix work. Compare counts `[1, 8, 32]` using validation. Charge hit checks,
misses, evictions, re-evaluation, and stale choices. These are experimental
defaults, not a promise that a cache helps. Record adversarial workloads that
alternate structure on every call while preserving total element counts.

Report break-even repetition count from complete sequences of 1, 2, 8, 32,
and 128 calls. An overhead moved to compilation still costs the user on cold
queries. A plan that wins only at 128 repetitions must be labeled accordingly.

Acceptance: plan hints never affect result truth, mutation/control tests pass,
memory stays bounded, and measured sequences show a net gain including cache
maintenance. Otherwise omit the cache from any runtime candidate.

## Phase 10: Test the exact build that could ship

Freeze one candidate and compare its built bytes with the unchanged baseline.
Include warm, cold, mutation, and fallback cases. Keep runtime changes out of
the package unless the full candidate passes the frozen correctness and
performance gates.

Create `neural/confirm.mts` to compare immutable baseline bytes and actual
candidate bytes. Keep experimental source, emitted code, weights, build
commands, and SHA-256 hashes. Only one frozen candidate enters final testing.

Measure:

- Warm all-results queries on both hosts.
- Cold-selector calls with preparation charged and setup scope stated.
- Repeated-query sequences with mutations.
- Small, simple, and ineligible controls that should bypass the learned work.
- Code size and compressed size using the existing build size helpers.
- Allocation/memory diagnostics only when the candidate adds retained state
  or allocations that warrant them. Do not infer these from speed ratios.

Run two independent confirmation passes. The first uses 11 rotating rounds
of at least 20ms, the second reverses fixture order and uses at least 24ms.
Use fresh processes and equivalent warmup. Record both passes in full.
Validate AC at run boundaries. A change between passes requires a new
candidate identity and restarts the confirmation, not selective reuse.

Use the frozen gate from phase 4 and report every failure. Mean speedup cannot
hide a supported fixture's regression beyond the limit. If the failed case
is noisy, perform a predeclared longer diagnostic for that case and its nearby
controls, preserve all runs, and report the unresolved result honestly until
the evidence is sufficient. Do not delete the slower sample or tighten scope
after seeing final test results and call the same test untouched.

Before runtime promotion, run meaningful focused tests and the affected
compatibility suites. The repository already contains these relevant files:

- `test/repo/unit/has-plans.test.mts`
- `test/repo/unit/optimizer-nesting.test.mts`
- `test/repo/unit/ancestor-reuse.test.mts`
- `test/repo/e2e/relative-has.test.mts`
- `test/repo/e2e/compiler-port-browser.test.mts`
- `test/repo/integration/adapter/jsdom.test.mts`

Add focused behavior tests for new routing, continuation, parity, and fallback
contracts. Do not add source-text snapshots or tests that repeat the model's
implementation without checking its observable behavior.

Example focused invocation for existing tests:

```sh
pnpm run build
node scripts/repo/run.mts node_modules/vitest/vitest.mjs run \
  --config .config/repo/vitest.config.mts \
  test/repo/unit/has-plans.test.mts \
  test/repo/unit/optimizer-nesting.test.mts
```

Run `pnpm run type` and `pnpm run lint` for changed scripts/runtime. Use the
repository's browser runner for browser tests. After a final runtime change,
run the affected unit/integration/browser coverage and `pnpm run test:wpt`
before claiming compatibility. The former `node test/wpt/wpt-test.mjs` command
belongs to an older layout and must not be invented in this checkout. Agent
reporting is already configured to use minimal Vitest output. Keep detailed
failure artifacts while keeping routine output concise.

If a runtime candidate passes, migrate its minimal required pieces from the
experimental implementation into the owning `src/core/` modules. Generate any
fixed weights from the recorded model and preserve the generator. Use readable
scalar code. Avoid runtime imports of Python, PyTorch, Hugging Face,
Transformers.js, ONNX, or WebGPU for this tiny synchronous decision.

Build and remeasure the final integrated bytes. An experimental replacement
can inline differently from the maintained source build, so its timing is not
automatically transferable. If final integration fails the gate, keep the
runtime change out and retain the research artifacts.

## Phase 11: Publish a report developers can understand

Show query time with a clear direction label, explain each chart below the
chart, and include both regressions and wins. Give the user enough context to
repeat the measurement.

Update the maintained Markdown report, performance journal, model training
guide, and the generated HTML served through the existing Portless site.
Keep one canonical source for measured values. Generate HTML from saved JSON.
Do not hand-copy numbers that can drift after a rerun.

Use horizontal bar charts. Every time chart must say “Lower is faster” and
show baseline at 100. A candidate at 90 means 10% less query time. A candidate
at 110 means 10% more query time. Do not use dot charts.

Provide separate charts for:

1. Optimistic oracle headroom, labeled as unattainable hindsight.
2. Standalone generic versus scalar model overhead, in ns per decision.
3. Actual integrated query time for baseline, simple controls, and neural
   candidate. This is the promotion chart.
4. Cold and mutation-sequence costs, each with its own baseline.

Attach the case scope and measurement context under every chart. Put shared
methodology and full commands in expandable details above the charts. Display
timing uncertainty separately from workload uncertainty. For a speed-ratio
interval `[L, U]`, normalized time is `[100/U, 100/L]`; reverse the endpoints.
The old neural report multiplies speed ratios by 100 while describing query
time. Correct that unit/direction mismatch when replacing the report.

Use one stable path, for example `/neural-planner.html`, under the existing
`nwsapi-model-guide.localhost:1355` service. Keep internal links root-relative
or correctly resolved once. Do not recreate nested `atlas/atlas/...` URLs.
Inspect the existing running service before changing its root. Do not stop an
unrelated Portless process or start duplicate servers on guessed ports.

Show each outcome as one of: measurement invalid, no useful headroom, candidate
rejected, candidate needs independent confirmation, or confirmed scoped win.
Explain “real trained model” with its exact architecture, learned weights,
input features, training data, and emitted implementation. Avoid treating an
AI label as an explanation of performance.

Acceptance: report values match the saved artifacts, links resolve, charts
have the correct direction, and the user can identify what actually shipped.

## Commit sequence and final delivery

Use logical commits, adjusting boundaries if a helper and its consumer must
land together:

1. `docs: mark neural planner comparison as superseded`
2. `fix: verify complete has planner routes in benchmarks`
3. `feat: record versioned planner measurements and baseline costs`
4. `research: measure planner headroom and input limits`
5. `perf: emit scalar neural planner inference`
6. `research: collect grouped selector training workloads`
7. `feat: train cost-sensitive neural planner policies`
8. `research: evaluate adaptive has query continuations`
9. Optional, only if justified: `research: evaluate reusable planner hints`
10. Conditional runtime commit only after confirmation: `perf: apply guarded neural query planning`
11. `docs: report integrated neural planner results`

Commit and push completed authorized work normally to the v3 prerelease
branch, preserving unrelated changes. A research commit can contain a rejected
candidate with a clear explanation. A runtime performance commit cannot claim
a rejected candidate as an optimization. Never publish a package as part of
this task.

For each completed phase record files changed, commands run, artifact hashes,
results, limitations, and the next task in the companion checklist. On context
compaction, resume from that record rather than rerunning completed collectors.
Never put a fabricated “passed” status in a checklist to make it look finished.

Final delivery must state whether production changed, whether a real model is
used at runtime, the measured host/scenario scope, the strongest supported
performance result, the important regression limits, checks actually run,
and commit/push status. Link the HTML and canonical artifacts. If no model
qualifies, say that clearly and identify which hypothesis failed.

## Troubleshooting and forbidden shortcuts

| Symptom                                                    | Required response                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Same route reached by both forced variants                 | Repair AST edit and route evidence before timing                                   |
| Python and emitted JS disagree                             | Fix encoding, normalization, margins, and fallback; do not average decisions       |
| Apparent gain only from changing the baseline formula      | Use directly measured baseline bytes and costs                                     |
| Model wins labels but loses query time                     | Select by integrated time; reject if overhead exceeds savings                      |
| Model needs DOM depth or subtree size                      | Measure how it is obtained, or keep it diagnostic-only                             |
| Extra epochs improve training loss but not validation time | Keep the best validation checkpoint and stop at the fixed budget                   |
| One final test family determines a change                  | It is now development data; obtain new independent confirmation                    |
| Prefix sees only easy anchors                              | Keep adversarial prefix cases, measure regret, and reject unsafe performance scope |
| Prefix strategy starts the whole query again               | Implement exact suffix continuation and charge all duplicate work until fixed      |
| Cache gets faster by returning stale results               | Remove result reuse; hints may select exact routes only                            |
| Browser timing estimated using Node inference              | Label it an estimate and collect integrated browser measurements                   |
| Run interrupted                                            | Resume only with matching manifest/hashes and recorded completed IDs               |
| AC unavailable                                             | Complete independent coding/parity work; leave AC measurements pending             |
| Candidate is faster only in one host                       | Keep host scope explicit; generic two-host gate has not passed                     |
| No candidate passes                                        | Finish the evidence/report and keep production behavior as the measured baseline   |

## Why these choices are reasonable

The architecture is inspired by learned query planning and JIT specialization,
but performance here must be demonstrated independently. Database queries often
have very different planning budgets from microsecond DOM queries.

- [Lero](https://arxiv.org/abs/2302.06873) learns to compare execution plans.
  It supports investigating relative plan preference rather than requiring
  precise absolute latency predictions. It does not establish a DOM speedup.
- [Bao](https://people.csail.mit.edu/tatbul/publications/bao_sigmod21.pdf) steers
  an existing optimizer with learned choices. Its results are for database
  workloads, not evidence that online exploration is suitable here.
- [V8 Maglev](https://v8.dev/blog/maglev) describes specialization using
  available information and runtime checks. Here we borrow the idea of
  specializing stable selector facts and preserving an exact fallback.
- [PyTorch ReLU](https://docs.pytorch.org/docs/stable/generated/torch.nn.ReLU)
  defines the simple activation proposed for the retrained scalar model.

The experiments above test three distinct hypotheses: better inputs can reveal
useful strategy choices, scalar compilation can make decisions cheap enough,
and reusable execution work can save more than it costs. Preserve that
separation so a negative result tells us what to change next.
