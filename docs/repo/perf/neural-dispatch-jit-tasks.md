# Dispatch and JIT work

## This experiment

- [x] Keep model weights and thresholds frozen.
- [x] Prove the unfiltered bypass from parsed policy and baseline guards.
- [x] Measure 96 fresh cases and three reproduction cases on both hosts.
- [x] Repeat in reversed order with identical generated bundles.
- [x] Check native results, element order and frozen route choices.
- [x] Capture isolated-query and mixed-document V8 traces outside timing.
- [x] Add an opt-in split mode to complete-query confirmation.
- [x] Finish the older-suite split confirmation.
- [x] Publish the measured outcome and responsive HTML report.
- [x] Complete final code and repository checks.
- [x] Commit and push the results to `prerelease/3.0.0`.

The split path remains experimental. Its first-pass unfiltered speed gain
did not hold in the reversed pass.

## Further experiments

Prioritize these by the work they can remove:

1. **Remove helper callback churn.** Investigate the lazy WeakMap factory,
   engine readers and generated predicate callbacks. Preserve legacy hooks,
   constructor capability checks and public Snapshot behavior. Compare a
   stable helper against current code across multiple documents and mixed
   selector families.
2. **Strengthen the simple-rule comparison.** Fit intermediate thresholds
   from training data before collecting fresh reserved cases. The current
   rule uses thresholds 2.5 and 4. The model's ratio-3 wins do not establish
   an advantage over a rule allowed to interpolate.
3. **Compile the frozen policy into cheaper native-count decisions.** Check
   whether exact integer-count intervals can replace arithmetic scoring.
   Prove equivalence across the supported domain. Measure code size, cold
   calls and complete queries before choosing tables or scalar branches.
4. **Avoid already-covered witness work.** Consider skipping witness
   predicates when an ancestor is already marked. Include all-miss and
   sparse-match cases so the check does not add costly DOM work to misses.
5. **Qualify application behavior.** Measure independent applications,
   cold queries, alternating selectors and DOM changes. Keep selector and
   context applicability checks explicit before runtime integration.

These follow-up experiments are not implemented or qualified yet.

## Built-in runtime planner

The [integration guide](neural-planner-integration.md) describes the default-enabled
`.mts` policies bundled into the main JavaScript file. Runtime qualification remains
open. Add route instrumentation that records the enabled callback decision
before measuring the planner.
