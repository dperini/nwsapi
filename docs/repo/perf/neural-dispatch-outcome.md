# Choose a query route before profiling

This experiment trains a real PyTorch model to choose a complete `:has()`
execution route. It uses facts that the engine already obtains. It removes
the four-anchor profiling step from the earlier experiment.

The new decision point produces gains on reserved synthetic templates, but
the learned policy does not earn runtime promotion. A simple rule matches it
in Chromium and performs better in `jsdom`. The Chromium repeat also exceeds
the regression limit on an older development case. Keep both policies in
development tools.

The [expanded training round](neural-dispatch-expanded-outcome.md) adds
separate filter inputs, intermediate counts, and safety checks during
checkpoint selection.

## Measured result

The table shows query time relative to current v3. Lower is faster. `100%`
means the same time as current v3. The repeat reverses fixture order and uses
24ms rounds with exactly the same model and generated code.

| Host and group                     | Model time, first pass | Model time, repeat | Simple rule, first pass | Simple rule, repeat |
| ---------------------------------- | ---------------------- | ------------------ | ----------------------- | ------------------- |
| Chromium, reserved synthetic cases | 84.6%                  | 92.2%              | 84.8%                   | 91.9%               |
| `jsdom`, reserved synthetic cases  | 86.2%                  | 85.8%              | 80.7%                   | 81.2%               |
| Chromium, older development cases  | 100.1%                 | 102.7%             | 100.3%                  | 102.7%              |
| `jsdom`, older development cases   | 99.7%                  | 99.6%              | 98.8%                   | 98.8%               |

Each reserved group contains 16 cases. Each development group contains 112
cases. These are geometric relative times for warm all-results queries.
They do not describe cold queries or application startup.

The Chromium model's worst development ratio rises from 1.123× to 1.183× in
the repeat. The rule reaches 1.205×. Both exceed the 1.15× regression limit in
the repeat. The `jsdom` model stays within that limit, but the older suite's
aggregate gain remains below the required 1.05× speed ratio.

On reserved `jsdom` cases, the model takes approximately 5.6–6.9% more time
than the simple rule across the two passes. Chromium's model-versus-rule
speed ratios are 1.001× and 0.997×. Those margins do not establish a model
advantage. More training epochs are not justified by this comparison.

The [HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-2026-10-05.html)
shows the repeat with lower-is-faster bars. The
[first summary](../../../assets/repo/bench/planner-dispatch-integrated-2026-10-05-r1/summary.json)
and [repeat summary](../../../assets/repo/bench/planner-dispatch-integrated-2026-10-05-r2/summary.json)
preserve both passes. Each host's archived candidate hash is identical
between passes. AC power is recorded before and after both hosts.

## Qualification decision

No learned policy or new threshold rule is added to the distributed engine.
The code, checkpoints, and measurements are committed as development tools.
The focused route and mutation tests, TypeScript check, repository lint,
script entrypoint check, naming check, and whitespace check pass.

Independent application evaluation, cold-query measurement, broad mutation
and memory qualification, and release testing are still required for any
future promotion. The existing engine's source is unchanged by this
experiment. Full WPT was not rerun for these offline tools.

The next useful work is to create larger algorithm choices, starting with
the positional lookup and scoped terminal-union tasks in the
[selector optimization plan](selector-optimization-luna-plan.md).
Train again after complete-query measurements show that the available inputs
can select useful choices better than a simple guard.

## What the model chooses

For `.card:has(.witness)`, the engine can use two exact methods:

- Forward execution checks each possible card for a matching descendant.
- Inverse execution finds possible witnesses, marks their ancestors, and
  returns the matching cards in document order.

Both methods must return the same elements. The model predicts which method
will take less time. It does not decide whether an element matches CSS.

The default action is the current v3 route. A model decision can change that
route only after the existing small-query and empty-witness exits. Missing
WeakMap support still uses the ordinary resolver.

## What changed in training

| Earlier experiment                                   | This experiment                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Profiles four anchors before making a choice.        | Uses counts and selector facts available after the existing witness preflight.        |
| Chooses between two prefix continuations.            | Keeps current v3 or chooses its other complete route.                                 |
| Fits 18 distinct cases from two families.            | Fits 48 cases from six new synthetic template families per host.                      |
| Searches networks with 2, 4, or 8 hidden units.      | Also tries a linear model, which needs only a weighted sum.                           |
| Selects mainly by geometric relative query time.     | Requires the regression gate, then selects by total time and geometric relative time. |
| Can save a selected checkpoint that failed its gate. | Records an explicit validation pass or rejection.                                     |

The trainer compares actual baseline time with the cost of the other route.
It treats the baseline's own route as exactly baseline time. This prevents
timing noise between equivalent methods from creating a false improvement.

Training gives more weight to costly route mistakes. Uncertain comparisons
receive zero weight when their paired timing interval includes a tie.
Mistakes that exceed the 15% regression limit receive an additional penalty.
The optimizer uses these weights to teach the model which overrides help.
Checkpoint selection uses measured validation costs plus an estimated
25ns decision budget. Complete-query measurements must verify that estimate.

## What the model reads

The five numeric inputs are anchor count, witness count, attribute mask,
eligibility for the existing dense inverse method, and witnesses per anchor.
The attribute mask records whether the anchor and witness selectors have
attribute tests. This corpus uses 0 for neither and 3 for both. Dense
eligibility identifies the existing route for two simple class selectors.
The counts describe prepared candidate collections. They are not final match
counts. Obtaining the witness collection already forms part of the current
engine's preflight and remains inside query timing.

The model does not read fixture names, timing labels, future query results,
or a DOM depth estimate. Each host trains its own model. Host information
therefore needs no runtime input.

Unsupported attribute categories, nonfinite numbers, and values outside the
training range keep the default route. This fallback limits extrapolation.
It does not guarantee that every in-range application resembles the training
templates.

## How the data is separated

There are 192 logical cases per host. Both hosts use matching fixtures and
the same group assignment.

| Group       | Template families             | Cases per host | Purpose                                            |
| ----------- | ----------------------------- | -------------- | -------------------------------------------------- |
| Training    | 6 new synthetic families      | 48             | Fit the weights.                                   |
| Validation  | 2 new synthetic families      | 16             | Select the model and threshold.                    |
| Evaluation  | 2 reserved synthetic families | 16             | Measure the frozen choice after validation passes. |
| Development | Existing benchmark families   | 112            | Check earlier workloads for gains and regressions. |

Related size, density, and predicate variants stay in the same template group.
The new templates vary nesting, witness placement, collection sizes, and
attribute filtering. They are synthetic DOMs built by the benchmark script.
They are not an independent application corpus.

The 48 training cases contain only eight distinct combinations of the cheap
inputs. Different layouts can therefore look identical to the model. More
hidden units cannot reveal structure that the inputs do not describe.
Attribute filtering and dense eligibility are also correlated in these
templates. Broader training needs additional selector shapes and application
groups before these inputs can support a release decision.

## How the generated code avoids work

Each host selected a linear PyTorch model. The Chromium checkpoint uses
epoch 34 and the `jsdom` checkpoint uses epoch 1. A validation-selected early
checkpoint is valid. More training steps do not necessarily improve the
route choice.

A linear model multiplies each input by a learned weight and adds the results.
Training adjusts the weights using measured route mistakes. A threshold
turns the resulting score into a keep-or-change decision. An epoch is one
pass over the training cases. The threshold is not a calibrated guarantee
that a query will be faster.

The exporter folds input normalization into the weights and writes scalar
JavaScript. A query needs no feature array, tensor library, or model download.

An interval calculation checks whether a model could override an existing
inverse route anywhere in its supported range. Both selected linear models
stay below their decision threshold in that region. The generated route
condition now checks the original route directly. JavaScript stops at the
`&&` operator when the original route is inverse. It does not call a dispatch
helper, read the attribute mask, convert the dense flag, or compute the ratio
on that path. The model runs only for remaining forward decisions.
Hidden-layer models without this certificate keep the general wrapper.

For example, the Chromium model's largest bounded score for an inverse route
is 0.406. Its decision requires a score above 0.50001. Even the most favorable
input in that region cannot change the route, so inference can be skipped.

The simple threshold rule uses the same inputs and range guards. It is timed
alongside the model so that the experiment can determine whether learned
weights add value.

## Direct route check follow-up

A follow-up keeps the same trained weights and moves the original route check
into the query condition. The first AC-powered measurement gives these
results. Lower percentages mean less query time than unchanged v3.

| Host     | Reserved synthetic cases | Older development cases | Worst development query |
| -------- | ------------------------ | ----------------------- | ----------------------- |
| Chromium | 85.3%                    | 99.6%                   | 108.6%                  |
| `jsdom`  | 86.9%                    | 99.3%                   | 103.5%                  |

The older cases still fail the required 5% average speed improvement. The
simple rule takes 85.4% of baseline time on Chromium's reserved cases and
81.2% on `jsdom`'s reserved cases. The model still has no useful demonstrated
advantage over the simple rule.

This pass compares each candidate with unchanged v3. It does not time the
old and new wrappers together. Differences from earlier passes can include
measurement variation. Do not attribute the full change to the shorter
condition. The previously reserved cases have now been examined, so these
results are follow-up development evidence.

The [follow-up summary](../../../assets/repo/bench/planner-dispatch-shortcircuit-2026-10-05-r1/summary.json)
preserves the timings and gate results. The
[follow-up HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-shortcircuit-2026-10-05.html)
uses the same lower-is-faster bars. Neither policy qualifies for runtime
promotion. A repeat and a paired comparison of both wrappers are still
needed before claiming that this code change improves query speed.

## Where better training could help

The 48 training cases per host provide only eight distinct input patterns.
Different layouts can have the same counts and selector flags. The current
model must choose the same route for all layouts with the same inputs.

In the saved `jsdom` training data, the filtered pattern with 256 anchors and
1,024 witnesses favors opposite routes across layouts. Its alternative route
takes between 56.6% and 105.9% of baseline time. These are training timings,
not a new complete-query result. More epochs cannot teach this model to
distinguish layouts that have identical inputs.

The next training experiment should do the following:

1. Vary anchor and witness filters independently. The current new templates
   always turn both filters on or both off.
2. Include counts between the current training endpoints of 48 and 256.
   Older cases with 192 anchors expose an interpolation risk.
3. Assign whole layout families to training, safety validation, and a fresh
   application evaluation set before collecting timings. Cases already
   inspected here cannot serve as new independent evidence.
4. Measure the best route for each shared input pattern. Check whether those
   inputs can satisfy the regression limit before training a larger model.
5. Add layout information only when the engine already has it or when a
   complete-query measurement proves that obtaining it pays for itself.
6. Compare the trained model with a simple rule and the unchanged engine.
   Promote neither candidate until repeat measurements pass every gate.

A GPU cannot supply missing layout information. GPU submission and data
transfer would also add work to these small decisions. Keep inference on the
CPU unless a separate batched workload demonstrates a complete-query win.

## Measurement and correctness

The collection saves the unmodified build and both forced routes. AST edits
replace the complete route condition. Instrumented variants prove which
method actually ran. Both hosts compare ordered result identities with
native queries before and after timing.

Complete-query measurements include the work performed by each warm query,
including preflight, range checks, emitted inference, and execution. Each case uses 11 rotating rounds
of at least 20ms. A reversed-order repeat uses 24ms rounds with the same
weights and generated code. AC power is checked at host boundaries.

Python and JavaScript agree on 20,332 saved parity inputs. These include
observed inputs, random inputs, and domain boundaries. Additional checks
cover nonfinite inputs. Route tests cover forced overrides, declined
overrides, skipped inference, small queries, empty witnesses, and mutation.

The collector releases closed `jsdom` instances between probe batches.
Collection was resumed after the first unbatched probe exhausted Node's
heap. Resume checks the build, fixtures, variants, and timing settings before
keeping a completed host's measurements.

## Reproduce the experiment

These archived checkpoints were trained with the script at commit `7337f65`.
The current trainer includes the expanded round's changes. Use the archived
script when reproducing the original training decisions.

Use new output directories. The existing development environment pins
Python and PyTorch through `.config/external-tools.json` and
`.config/model-training/`.

```sh
NWSAPI_REQUIRE_AC=1 pnpm run bench:planner:dispatch:collect assets/repo/bench/dispatch-new
pnpm run bench:planner:dispatch:train --input assets/repo/bench/dispatch-new --output assets/repo/bench/dispatch-model-new
NWSAPI_REQUIRE_AC=1 pnpm run bench:planner:dispatch:confirm assets/repo/bench/dispatch-new assets/repo/bench/dispatch-model-new assets/repo/bench/dispatch-integrated-new
NWSAPI_REQUIRE_AC=1 pnpm run bench:planner:dispatch:confirm assets/repo/bench/dispatch-new assets/repo/bench/dispatch-model-new assets/repo/bench/dispatch-repeat-new repeat
node scripts/repo/run.mts scripts/repo/bench/planner/dispatch/report.mts assets/repo/bench/dispatch-integrated-new assets/repo/bench/dispatch-integrated-new/report.html
```

For an interrupted collection, append `resume` to the collection command.
Complete-query confirmation refuses changed build or model hashes. Saved
checkpoints, weights, domains, search results, parity cases, route evidence,
raw timing rounds, and generated JavaScript remain with the measurements.
