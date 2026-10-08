# What the dispatch experiment measured

New to the terminology? Start with the [beginner's guide to PyTorch and
`:has()` routing](pytorch-for-beginners.md) and its
[animated walkthrough](pytorch-has-routing.html).

The split matcher remains an opt-in experiment. Its first speed gain on
queries without attribute filters did not repeat. Production `nwsapi` code
and the trained model weights are unchanged.

## Read the charts

[Open the HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html).
Lower bars mean less time and faster queries. Current v3 is 100%. A bar at
80% means the query takes 20% less time than current v3.

The report compares six versions across Chromium and jsdom. Each version
runs complete queries. It includes candidate collection, filtering and
result creation. These are warm queries, after the JavaScript engine has
had time to optimize the code.

## Why split the matcher?

The frozen model cannot change the route for queries without attribute
filters. The split experiment sends those queries through the original
matcher body. Queries with filters use a separate body that can consult
the model.

The generator checks this property from parsed policy guards. It also
checks that the baseline route expression still matches the expression
used in the proof. It rejects an unsupported policy or changed baseline.
The proof assumes integer DOM candidate counts and a ratio calculated
from those counts.

## What repeated?

We measured 96 fresh cases and three previously examined slow cases on
AC power. We then reversed the version order and repeated the measurements
with identical generated bundles and frozen policies.

| Host     | First pass: split versus original model, without filters | Reversed pass  |
| -------- | -------------------------------------------------------- | -------------- |
| Chromium | 5.3% less time                                           | 0.2% more time |
| jsdom    | 4.7% less time                                           | 0.4% more time |

The first gain is insufficient evidence for a runtime change. The repeated
results show that version order and runtime feedback can affect these
small differences.

The model selected a different route from the simple rule for 12 fresh
Chromium cases with both filters and a witness ratio of 3. This suggests
that intermediate thresholds deserve study. The rule was fitted with
thresholds 2.5, 4 and 8. These results do not establish an advantage over a
rule with intermediate thresholds. The jsdom model and rule chose the same
routes on the fresh cases.

## Older-suite confirmation

The split version completed 112 older cases, 48 crossed validation cases
and 48 crossed evaluation cases on each host. This was one confirmation
pass. It does not replace the reversed fresh-case measurements.

| Host     | Older cases: model time saved | Validation time saved | Evaluation time saved |
| -------- | ----------------------------- | --------------------- | --------------------- |
| Chromium | 0.8%                          | 33.6%                 | 31.8%                 |
| jsdom    | 2.6%                          | 41.6%                 | 40.4%                 |

These percentages use the geometric average of relative query time against
current v3. Both older-suite groups fail the existing minimum-gain gate.
The simple rule also fails that gate. The strong crossed-case results do
not qualify either candidate for production.

All complete-query result and route checks finished successfully. The
saved Python and JavaScript policies agreed on 41,112 comparisons with
zero mismatches. The model and rule bundle hashes match the fresh-case
experiment.

## What the JIT traces show

A JIT compiler turns frequently used JavaScript into optimized machine
code. It records information about calls and values. If later calls do
not match that information, it can discard an optimization. This is called
deoptimization.

Both versions reached optimized V8 tiers and inlined matching helpers.
The original bulk matcher has 298 bytes of bytecode. The model version
has 346 bytes. The unchanged body in the split version has 298 bytes.
Bytecode size alone does not explain query time.

Mixed-document traces recorded four deoptimizations in the tracked core
functions for the baseline, four for the model and five for the split.
Several involve callback targets or feedback cells. The split did not
eliminate this behavior. Logging changes execution, so these traces are
diagnostic evidence and are separate from timing results.

## Evidence and next work

The benchmark checks native element identities, result order and expected
route choices. The first and reversed passes use the same candidate hashes.
Saved artifacts include generated bundles, fixtures, timings and V8 logs.

- [Experiment design](neural-dispatch-jit-plan.md)
- [Remaining experiments and completion checklist](neural-dispatch-jit-tasks.md)
- [First measurements](../../../assets/repo/bench/planner-dispatch-jit-2026-10-05-r1/)
- [Reversed measurements](../../../assets/repo/bench/planner-dispatch-jit-2026-10-05-r2/)
- [Older-suite split confirmation](../../../assets/repo/bench/planner-dispatch-crossed-split-2026-10-05-r1/)
- [Mixed-document traces](../../../assets/repo/bench/planner-dispatch-jit-trace-mixed-2026-10-05-r1/)

The next useful experiments are stable helper callbacks and a stronger
simple rule. Both need separate measurements before runtime integration.
