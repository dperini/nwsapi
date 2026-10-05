# Check route choices across independent filter combinations

This experiment tests whether the small model still helps when each layout
uses every filter combination. The model changes route selection. It does
not change how either route finds matching elements.

An anchor is a possible `.card` match. A witness is a `.witness` element
searched by `:has()`. The forward route searches from anchors. The inverse
route starts from witnesses and works back toward anchors.

## What changed

The new measurement set contains 192 cases in eight fresh layouts. Each
layout uses 32, 96 and 192 anchors, witness ratios of 2.5 and 4, and all four
attribute-filter combinations. There are also 112 older safety cases.

The previous set linked filter combinations to layouts. The model could
use a filter flag to guess the layout. This set removes that link.

Four layouts train the weights. Two layouts select the checkpoint and
threshold. Two layouts evaluate the frozen policy. Evaluation timings do
not select weights, thresholds or rule settings.

The comparison rule fits a count limit and ratio threshold for each filter
combination. If validation and safety rankings tie, lower total training
cost breaks the tie. This change uses no evaluation timings.

## What training found

Chromium selects four hidden units with 33 learned parameters. `jsdom`
selects a linear model with seven learned parameters. Both pass the training
validation check. On those validation cases, each model makes the same route
choices as its fitted rule. That result does not establish a benefit from
using neural inference.

The available inputs are candidate counts, two filter flags, the dense-route
flag and the witness ratio. These inputs do not describe nesting depth or
where witnesses sit in the DOM. Two queries with identical inputs can favor
different routes. Adding hidden units cannot recover information absent
from the inputs.

The training diagnostics find three conflicting input groups in Chromium.
Each group includes a case where changing the route takes at least 5% less
time and another where it takes at least 5% more time. The `jsdom` training
set has no conflicts under that definition. These diagnostics use saved
route timings. They are not independent performance measurements.

## Measure complete queries

Collection and confirmation require AC power. Each case uses 11 rotating
timing rounds. The first confirmation uses at least 20ms per round. A second
confirmation reverses case order and uses at least 24ms per round.

The measured query includes the witness preflight, route decision, emitted
JavaScript inference and matching work. Result order and element identities
must match the native query. Python and JavaScript decision parity must
pass before confirmation starts.

The old cases influence model selection as safety controls. They are not
independent application evidence. Synthetic query frequencies also do not
represent real application workloads.

## Measured results

Lower percentages mean less complete-query time than unchanged v3. Each
reserved group contains 48 cases. The older group contains 112 cases.
The percentages use the geometric average of relative query times.

| Host and group     | First model pass | Reversed model pass | First fitted rule | Reversed fitted rule |
| ------------------ | ---------------- | ------------------- | ----------------- | -------------------- |
| Chromium, reserved | 67.7%            | 69.7%               | 68.0%             | 69.7%                |
| Chromium, older    | 99.9%            | 100.1%              | 100.0%            | 100.4%               |
| jsdom, reserved    | 59.9%            | 61.2%               | 60.2%             | 61.5%                |
| jsdom, older       | 97.2%            | 97.3%               | 97.6%             | 98.3%                |

The new reserved cases improve in both passes. The model takes about
30–32% less time in Chromium and 39–40% less in `jsdom`. The fitted rule
achieves almost the same gains.

Instrumented queries confirm that the model and rule choose identical
routes on all 208 measured cases in each host, in both passes. Model time
is within about 0.6% of rule time on reserved cases. This round establishes
no advantage in learned route choices over the fitted rule. Small timing
differences can reflect emitted code and measurement variation.

### Check smaller queries and separate filters

Each anchor-count slice contains 16 reserved cases. Each filter slice
contains 12 reserved cases. These groups are synthetic and equally weighted.

| Reserved slice      | Chromium first | Chromium repeat | jsdom first | jsdom repeat |
| ------------------- | -------------- | --------------- | ----------- | ------------ |
| 32 anchors          | 69.2%          | 69.9%           | 61.3%       | 62.3%        |
| 96 anchors          | 66.9%          | 69.1%           | 59.3%       | 60.6%        |
| 192 anchors         | 67.1%          | 70.1%           | 59.2%       | 60.7%        |
| No attribute filter | 99.8%          | 104.5%          | 99.2%       | 101.5%       |
| Witness filter only | 53.2%          | 54.8%           | 45.6%       | 47.2%        |
| Anchor filter only  | 49.0%          | 49.6%           | 42.2%       | 42.4%        |
| Both filters        | 80.8%          | 82.9%           | 67.5%       | 69.0%        |

The 32-anchor cases improve along with larger cases. Single-filter cases
produce the largest gains. Cases without an attribute filter gain little
and become slower in the repeat.

### Preserve the failed worst-case check

Chromium's repeat fails the reserved worst-case limit. The query
`crossed-7-192-4-0` takes 123.2% of baseline time with the model and 120.1%
with the fitted rule. It has no attribute filters, 192 anchors and 768
witnesses. Both candidates keep the baseline inverse route.

The baseline samples range from about 21.0µs to 21.9µs. Model samples range
from 25.9µs to 26.5µs. This is a sustained difference within that pass,
not one slow timing sample. Another unfiltered case takes 122.1% of
baseline time. Keeping the route does not guarantee that added dispatch
code is free. Generated-code shape and JIT behavior need investigation.
The measurements do not establish the cause.

`jsdom` passes the reserved worst-case check in both passes. Its worst
reserved query takes 113.2% of baseline time in the repeat. Both hosts
miss the required 5% average gain on older cases. Neither policy qualifies
for runtime integration.

Python and emitted JavaScript agree on 41,112 model and rule parity cases,
with zero mismatches. Complete queries also pass native result identity,
result-order and route checks. AC power is recorded before and after each
host in collection and both confirmation passes.

The [HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html)
shows the reversed pass with lower-is-faster bars. The
[comparison artifact](../../../assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1/complete-query-comparison.json)
preserves both passes, route differences and input slices. The
[first summary](../../../assets/repo/bench/planner-dispatch-crossed-integrated-2026-10-05-r1/summary.json)
and [reversed summary](../../../assets/repo/bench/planner-dispatch-crossed-integrated-2026-10-05-r2/summary.json)
preserve the performance checks.

## Qualification

The existing performance check requires at least a 1.05× geometric speed
ratio, no increase in total query time, and no query taking more than 1.15×
baseline time. Both the reserved group and older group must pass. A neural
model also needs a useful advantage over the fitted rule.

Production integration still needs selector and context applicability
checks, cold queries, mixed query sequences, DOM changes and independent
application measurements. The distributed `nwsapi` engine keeps its current
routing policy during this experiment.

## Next useful work

1. Investigate the unchanged-route slowdown with a separate diagnostic
   corpus. Vary nesting depth and witness placement. Inspect JIT
   optimization and deoptimization before changing generated code.
2. Try a compiler specialization that leaves selectors with provably
   impossible overrides on the original dispatch path. Prove that it
   preserves the frozen policy for every supported input. Measure it on
   fresh cases before using it.
3. Qualify the simpler fitted rule on independent application workloads.
   Keep the neural model as an offline tool for finding useful policies
   unless it can make better decisions with a useful measured margin.
4. Improve the route algorithms or use facts already obtained during
   matching. Adding DOM scans just to help the model can consume the gain.
5. Measure cold queries, alternating selectors and DOM changes. Synthetic
   warm-query gains do not qualify these workloads.

Do not change the frozen models or their thresholds using these evaluation
results. A new training experiment needs fresh reserved evidence.

## Reproduce the confirmation

Use the collection command in the [experiment plan](neural-dispatch-crossed-plan.md).
Use new output directories when collecting or training again.

```sh
PATH="$PWD/.cache/bin:$PATH" .cache/bin/uv run \
  --project .config/model-training --locked python \
  scripts/repo/bench/planner/dispatch/train.py \
  --input assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1 \
  --output assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1

PATH="$PWD/.cache/bin:$PATH" NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts \
  scripts/repo/bench/planner/dispatch/confirm.mts \
  assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1 \
  assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1 \
  assets/repo/bench/planner-dispatch-crossed-integrated-2026-10-05-r2 repeat
```

Omit `repeat` for the first pass. Run `dispatch/compare.mts` with both
confirmation directories and a new JSON output path to check code hashes,
route choices and input slices.

## Dispatch follow-up

The [JIT outcome](neural-dispatch-jit-outcome.md) records fresh cases, a
reversed pass and the older-suite split confirmation. The split matcher
remains experimental.
