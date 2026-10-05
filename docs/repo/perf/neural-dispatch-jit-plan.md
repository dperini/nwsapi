# Investigate dispatch cost when the route stays unchanged

Keep the crossed experiment's model weights and fitted rules frozen. This
experiment changes generated code, not learned route choices.

## Compare the added work

Measure six variants together:

1. Current v3.
2. Current v3 with only the filter-mask property added to each query plan.
3. The dispatch branch with a helper that always keeps the baseline route.
4. The frozen model with its existing dispatch branch.
5. The frozen model with separate matching functions for unfiltered and
   potentially overridden selectors.
6. The fitted rule with those separate functions.

The split variants keep the original bulk matching function for unfiltered
selectors. They use a second function for selectors with attribute filters.
The plan still has the filter-mask property. This comparison separates the
matching-function change from the plan-property change.

## Prove the bypass

Parse the emitted policy before generating a split variant. Require its
initial guards to reject attribute mask 0 with dense flag 0. For mask 0 and
dense flag 1, require an anchor upper bound of at most 192 and a witness
ratio upper bound of at most 4.

Within those bounds, the existing route is inverse. Outside those bounds,
the policy returns false. The forward-only policy therefore cannot change
any unfiltered route. Candidate counts are DOM collection lengths. The
ratio is computed from those same integer counts.

If the required guards are absent or broader, stop generation. Do not guess
that the bypass is safe for a future model. Record the policy source hash
with the proof.

## Use fresh diagnostic cases

Fix these values before measuring:

- Nesting depths of 2, 7 and 15.
- Fractions of witnesses outside all anchors of 0.2 and 0.8.
- 48 or 144 anchors.
- Witness ratios of 3 or 5.
- All four attribute-filter combinations in every geometry.

This gives 96 new cases. Ratio 3 is within the frozen model's range. Ratio 5
is outside it and must keep the baseline route. Keep the three previously
examined slow cases in a separate reproduction group.

Run both Chromium and `jsdom` on AC power. Use 11 rotating timing rounds of
at least 20ms. Repeat with reversed case order and at least 24ms per round.
Check native result identities, result order and instrumented route choices.
Do not use the new timings to retrain weights or adjust thresholds.

## Inspect JIT behavior separately

Capture V8 optimization, deoptimization and inlining logs outside performance
measurements. Logging changes timing and cannot establish a speed gain.
An isolated repeated query also has different feedback from a long run that
changes fixtures and documents.

The initial trace reaches Maglev and TurboFan for both versions. The bulk
matching function has 298 bytecode bytes in baseline and 346 in the model
variant. Both inline ancestor marking and candidate collection helpers.
That trace does not establish the cause of the previous slowdown.

## Decide what to retain

Keep the split generator experimental unless fresh measurements show a
repeatable improvement and acceptable worst-case behavior. The earlier
production qualification failures still apply. Neither a split function
nor a new synthetic gain qualifies the trained policy for the distributed
engine.
