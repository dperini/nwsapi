# Check the model across independent filter combinations

The previous measurements linked each filter combination to a layout. A model could use the filters to guess the layout. This experiment removes that shortcut.

## Build the measurement set

Use eight fresh layouts. Each layout contains every combination of:

- 32, 96 or 192 anchor elements. An anchor is a `.card` element that could match the query.
- 2.5 or 4 witness elements per anchor. A witness is a `.witness` element searched by `:has()`.
- No attribute filter, an anchor filter, a witness filter or both filters.

This gives 24 cases per layout and 192 new cases. Keep the 112 older cases as safety controls. Do not train on their timings.

The nesting depths are 1, 5, 9, 3, 7, 11, 4 and 13. The fractions of witnesses outside all anchors are 0.1, 0.35, 0.6, 0.85, 0.2, 0.45, 0.7 and 0.9. These values are fixed before measurement.

Use layouts 0–3 for training, 4–5 for validation and 6–7 for final evaluation. Final evaluation timings must not select weights, thresholds or rule settings.

## Compare fairly

Train the existing small PyTorch models with separate anchor and witness filter inputs. Keep the baseline route when an input falls outside the training range. Keep existing inverse routes unchanged.

Fit the comparison rule with the same validation and safety checks. When those rankings tie, prefer the rule with lower total training time. Final evaluation timings do not break ties.

Collect complete query timings on AC power. Compare the baseline, the fitted rule and the trained model. Freeze the model before final evaluation. Repeat measurements in reversed case order.

Keep the existing promotion requirements. A synthetic improvement alone does not qualify the model for the production engine. The older cases, real application queries, cold calls, mixed queries and DOM changes still need qualification.

## Run the experiment

From the v3 worktree, use the pinned tools:

```sh
PATH="$PWD/.cache/bin:$PATH" NWSAPI_REQUIRE_AC=1 node scripts/repo/run.mts scripts/repo/bench/planner/dispatch/collect.mts assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1 crossed
```

If collection stops, use the same directory with `resume-crossed`. The collector checks that the engine, fixtures and measurement settings match before it resumes.

Collection, training and two confirmation passes are complete. See the [measured outcome](neural-dispatch-crossed-outcome.md). Neither candidate qualifies for runtime integration.
