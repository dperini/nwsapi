# Train a route model with separate filter inputs

This round improves the development model and the data used to train it.
The model chooses whether to replace the existing forward `:has()` route
with inverse execution. Both routes must return the same elements in the
same order.

For `.card:has(.witness)`, a possible card is an anchor. A matching descendant
is a witness. Candidate counts come from the class seeds before attribute
filters run. The existing dense flag identifies two simple exact class seeds.

The distributed `nwsapi` engine keeps its current routing policy. A trained
checkpoint becomes a runtime candidate only after measured queries pass the
performance checks.

## What changed

The new corpus has 128 synthetic cases in eight layout families. Four
families train the model, two select the checkpoint, and two evaluate the
frozen checkpoint. The 112 older benchmark cases act as safety controls.
Their timings influence checkpoint selection. They are not independent
application evidence.

The new cases cover the following inputs:

- 64, 128, 192, or 256 possible anchors.
- Witness counts equal to 0.25, 2.5, 4, or 8 times the anchor count.
- No attribute filter, an anchor filter, a witness filter, or both filters.
- Different nesting depths and numbers of witnesses outside the anchors.

A balanced schedule assigns one filter combination to each count and ratio
within a layout. Across the four training layouts, each count and ratio
appears with all four combinations. These are synthetic layouts. They do
not represent query frequencies in a real application.

The previous model treated the numeric filter mask as one input. That mask
is an encoding, not a measure of cost. The new model learns the two filter
flags separately. It uses six inputs: anchor count, witness count, anchor
filter, witness filter, dense-route flag, and witness ratio. Extracting the
flags needs two bit operations and no extra DOM scan.

## How checkpoint selection works

Training changes weights so the model makes fewer costly route choices.
The loss combines percentage mistakes with wasted time. A large absolute
loss can matter even when its percentage is modest. A small query can also
matter when its relative slowdown is large.

Uncertain route comparisons receive no training weight when paired timing
samples do not establish a difference. Existing inverse-route cases receive
no training weight because this policy always keeps that route.

For each candidate checkpoint, selection checks the older cases first:

- No old case may take more than 110% of its measured baseline time.
- The sum of the old query times may increase by no more than about 1%.

These safety checks use estimated inference cost. Actual complete-query
measurements must verify them. The normal validation check still requires
at least a 1.05× geometric speed ratio, no increase in total time, and no
query taking more than 115% of baseline time.

The exporter declines filter and dense-flag combinations absent from
training. It also explicitly declines every existing inverse-route choice.
The generated query checks the original route before calling the model.
That rule applies to linear and hidden-layer models alike.

Chromium selects a model with four hidden units and 33 learned parameters.
`jsdom` selects a linear model with seven learned parameters. The interval
simplifier removes no units or ReLU checks from these selected checkpoints.
Its presence is not a measured pruning win in this round.

The comparison rule now fits a count limit and ratio threshold for each
filter combination. It can keep different limits for anchor-only and
witness-only filters. Each group and the combined policy must satisfy the
older-case safety checks. This gives the model a stronger comparison than
one global ratio threshold. The rule uses the same validation timings and
never uses evaluation timings to choose its limits.

The exporter can remove a hidden unit that is always zero within the guarded
input range. It can also remove a ReLU check when the unit is always positive.
A ReLU returns the larger of zero and its input. Range checks make these
simplifications exact within the supported domain. The exporter does not
round or discard small learned weights.

## Reuse a repeated route decision

The cache stores four numbers and one Boolean: anchor count, witness count,
filter mask, dense-route flag, and the last answer. The ratio comes from the
two counts. Identical inputs give the same answer from this pure policy.

On a hit, the query skips ratio division, input guards, and scoring. Each
query still matches the current DOM and returns current results. Changing
any of the four inputs makes the next query compute a fresh decision.

Each loaded policy keeps one entry, so the cache cannot grow with the number
of selectors or documents. It holds no references to elements or documents.
Alternating input tuples can cause repeated misses. Cold queries and those
mixed workloads require separate measurements.

The cache comparison runs five variants together: v3, the filter-specific
rule, the model, the cached model, and the cached rule. Instrumented repeats
must show a cache hit and zero fresh inference calls. Both routes still have
to return the native query's elements in the same order.

## Why more training has limited value on older cases

The [development headroom audit](../../../assets/repo/bench/planner-dispatch-expanded-model-2026-10-05-r2/development-headroom.json)
uses saved median costs to choose the cheaper route for each old case. It
assumes perfect knowledge and no decision cost. It is an optimistic
calculation, not a measured implementation or a universal speed limit.

In that snapshot, perfect routing takes 97.3% of baseline time in Chromium
and 95.0% in `jsdom`, using the geometric average. Restricting choices to the
new model's supported inputs gives 99.7% and 98.6%. These figures explain why
more training alone cannot deliver a large gain on the old suite. To create
more useful choices, improve the route algorithms or expand their coverage.

## Measurement

The collector saves v3 and both forced routes. Instrumented queries record
which route ran. The first `jsdom` measurement exhausted Node's heap near the end. The
measurement loop now gives queued window cleanup an event-loop turn between
cases. This pause is outside the timed query. Collection resumed with the
saved Chromium results and reran the `jsdom` host.

Before export, declared model inputs must equal inputs
observed inside the route decision.

The first comparison uses the global threshold rule from the earlier round.
The second comparison uses the stronger filter-specific rule with the same
model weights. Both emitted model hashes must match before the second run.

After training, confirmation checks Python and emitted JavaScript decisions
on observed inputs, random inputs, and boundaries. It then measures complete
warm queries against unchanged v3 and a simple rule. All route selection and
inference costs remain inside the timed query.

The evaluation families do not affect gradients, checkpoint selection, or
threshold selection. Evaluation runs only after the training checks pass.
A failed checkpoint cannot gain an evaluation result by weakening its gate.

## Measured results and decision

Lower percentages mean less query time than unchanged v3. Each reserved
synthetic group has 32 cases. The older group has 112 cases.

| Host and group               | First model pass | Reversed model pass | Cache run, uncached model | Cache run, cached model |
| ---------------------------- | ---------------- | ------------------- | ------------------------- | ----------------------- |
| chromium, reserved synthetic | 80.2%            | 78.3%               | 81.6%                     | 81.8%                   |
| chromium, older cases        | 100.0%           | 100.1%              | 99.7%                     | 99.5%                   |
| jsdom, reserved synthetic    | 72.2%            | 71.9%               | 72.6%                     | 72.7%                   |
| jsdom, older cases           | 98.4%            | 98.8%               | 98.6%                     | 98.5%                   |

The frozen model reduces time on the new reserved cases across all three
passes. The groups cover more filter combinations than the previous round.
The changed corpus prevents a direct percentage comparison with that round.

In the reversed pass, the model takes about 0.3% less time than the stronger
rule in Chromium and 7.3% less in `jsdom`. In the five-variant pass, the
uncached model takes about 1.4% less time in Chromium and 7.1% less in
`jsdom`. Chromium's small margins need more evidence. The `jsdom` difference
is promising synthetic evidence and still needs application evaluation.

The cache avoids inference on 57 repeated forward decisions per host in the
instrumented probes. Those repeats make zero fresh inference calls. Its
complete-query time on reserved cases is about 0.3% higher in Chromium and
0.2% higher in `jsdom` than uncached inference in the same run. It does not
establish a query-speed win. Keep caching opt-in for development experiments.

All older model groups stay within the 15% worst-query limit. Their average
gains remain below the required 5%. Neither the model nor the fitted rule is
promoted into the engine. The older-suite headroom calculation also shows
that routing alone has little room to satisfy that average target.

The [HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-expanded-2026-10-05.html)
shows all five variants with lower-is-faster bars. The
[first summary](../../../assets/repo/bench/planner-dispatch-expanded-integrated-2026-10-05-r1/summary.json),
[reversed summary](../../../assets/repo/bench/planner-dispatch-expanded-integrated-2026-10-05-r2/summary.json),
and [cache summary](../../../assets/repo/bench/planner-dispatch-expanded-cached-2026-10-05-r1/summary.json)
preserve the three passes. Both models and the stronger rule agree with their
saved Python decisions on 40,856 parity inputs. AC power is recorded before
and after each host.

The [fully crossed follow-up](neural-dispatch-crossed-outcome.md) completes
items 1–3 below. It finds strong synthetic routing gains, but the model and
fitted rule make identical measured decisions. Neither qualifies for runtime
integration.

## Next useful improvements

1. Try every filter combination in every layout. The current schedule links
   a filter combination to a layout at each count and ratio. The model can
   use that link to guess layout costs. Fully crossing these variables will
   test whether the filter effects generalize.
2. Include 32-anchor cases in a new corpus. The current 64-anchor minimum
   excludes several older cases with route-choice headroom.
3. Use training costs to resolve ties between equally good validation rules.
   The current stronger rule fits its limits on validation timings alone.
4. Improve the route algorithms before asking the model to produce large
   gains on cases where both available methods already have similar costs.
5. Measure cold queries, alternating input tuples, mutations, and real
   applications. These warm synthetic results do not qualify those workloads.
6. Require an explicit selector and context applicability guard before any
   runtime integration. The new templates use class seeds in HTML documents.

## Reproduce this round

Use the pinned Node, Python, and PyTorch tools from the repository. Output
directories must be new so existing measurements stay intact.

```sh
PATH="$PWD/.cache/bin:$PATH" NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts \
  scripts/repo/bench/planner/dispatch/collect.mts \
  assets/repo/bench/planner-dispatch-expanded-2026-10-05-r1 expanded

PATH="$PWD/.cache/bin:$PATH" .cache/bin/uv run \
  --project .config/model-training --locked python \
  scripts/repo/pytorch/dispatch_train.py \
  --input assets/repo/bench/planner-dispatch-expanded-2026-10-05-r1 \
  --output assets/repo/bench/planner-dispatch-expanded-model-2026-10-05-r2

PATH="$PWD/.cache/bin:$PATH" NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts \
  scripts/repo/bench/planner/dispatch/confirm.mts \
  assets/repo/bench/planner-dispatch-expanded-2026-10-05-r1 \
  assets/repo/bench/planner-dispatch-expanded-model-2026-10-05-r2 \
  assets/repo/bench/planner-dispatch-expanded-integrated-2026-10-05-r2 repeat
```

Add `cached` instead of `repeat` and choose a new output directory to run
the five-variant cache comparison. Use the first model's archived trainer
from commit `c8dd23a` to reproduce the global-rule comparison. The model
sources from both training runs must have identical hashes.

The [previous round](neural-dispatch-outcome.md) preserves the earlier
measurements and explains the two execution routes.
