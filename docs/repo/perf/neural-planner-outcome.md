# Neural planner implementation outcome

## In brief

The trained model added work to every measured query and did not make the
workload faster. Keep its code and weights in development tools only. The
table below reports time relative to the current engine: `100%` is the
baseline, and a value above `100%` took longer. See the [performance work guide](guide.md)
for more help reading ratios.

October 5, 2026. Worktree: `/tmp/nwsapi-v3-compiler-land`.
Branch: `prerelease/3.0.0`.

## Result

The implemented PyTorch policy does not make current v3 queries faster.
Keep it in development tooling. No neural model or adaptive prefix path is
added to the distributed selector engine. The earlier empty-witness preflight
and guarded inverse routing remain in place.

| Host     | Current v3 query time | Simple prefix rule | Trained continuation model |
| -------- | --------------------- | ------------------ | -------------------------- |
| Chromium | 100%                  | 155.1%             | 141.5%                     |
| `jsdom`  | 100%                  | 213.8%             | 170.7%                     |

Lower percentages are faster. These are geometric relative times across 112
known development queries per host, with 11 rotating rounds of at least
20ms. All query work is timed, including the four-anchor prefix, counters,
neural decision, and remaining query execution. Ordered result identities
are checked around timing. AC power is recorded at host boundaries. These
are warm all-results queries on known fixtures, not independent application
or cold-start results. The exact values are in the
[generated summary](../../../assets/repo/bench/planner-adaptive-integrated-2026-10-05-r1/summary.json).

The model's worst time ratios are 14.533× in Chromium and 32.197× in `jsdom`.
It fails both the 1.05× aggregate speed ratio and the 1.15× maximum time ratio
required for promotion. A perfect, zero-cost choice between the two measured
prefix continuations would still add 27.1% and 47.4% query time, respectively.
Better labels or more epochs cannot remove the prefix work already paid for
on every eligible query in this design.

## What is implemented

1. A reference routing contract, boundary cases, and AST edits that replace
   the complete route condition. Instrumented twins prove which route ran.
2. Corrected format-2 data preserving measured baseline costs, route facts,
   ordered results, source hashes, fixture hashes, and timing rounds.
3. Headroom diagnostics. Existing route choices allow only 1.027854×
   conservative free-choice speed ratio in Chromium and 1.053251× in `jsdom`.
   Chromium fails the aggregate gate even before charging inference.
4. Scalar export of the earlier network, folded constants, and host folding.
   Node decision-only cost falls from 164.7ns for generic code to 63.1ns for
   folded code on rotating inputs. The existing guard takes 13.7ns.
   This diagnostic uses old weights to isolate code generation. It is a
   different network from the retrained continuation policy.
5. An experimental query executor that reuses a useful prefix and finishes
   using forward checks or inverse ancestor marking, preserving result order.
6. A new cost-sensitive PyTorch trainer with family grouping, paired timing
   uncertainty, regression weights, validation-based checkpoint selection,
   nine model/seed candidates, scalar JavaScript export, and a saved checkpoint.
7. Actual query integration of the exported model and an HTML bar-chart report
   generated from saved measurements. The old trainer refuses new runs with
   invalid historical labels.

The selected network has seven numeric inputs, two ReLU hidden units, and
one output. It learns when to change the simple prefix rule. Inputs describe
the anchor count, processed prefix, passed predicates, hits, candidate visits,
single-class eligibility, and host. The host input and normalization are folded
into exported constants. The selected checkpoint is epoch 49. The exporter
uses a 1e-5 decision band and falls back outside the observed training range.

Python and JavaScript decisions agree on 10,216 checked adaptive inputs.
Earlier scalar export checks cover 10,096 JavaScript inputs and 10,084
nonzero-anchor Python inputs. These are empirical parity checks, not a proof
of floating-point equality on all possible inputs. Existing focused checks
also cover route execution, oracle arithmetic, adaptive ordering, and mutation.

## Deferred after the failed pilot

The larger application corpus, additional structural features, K=2/K=8
collections, cached route hints, mutation timing, cold-query timing, independent
repeat confirmation, and release qualification are not completed. The current
prototype's large integrated regressions do not justify promoting it or
paying those qualification costs. Its development pipeline remains available
for a changed hypothesis. See the [task list](neural-planner-task-list.md) for
phase-by-phase status.

A useful next hypothesis would select which queries merit prefix profiling
before paying for it. That selection must use facts already available at
dispatch, charge its own cost, and compare with a simple static guard. It
would require new evaluation groups. This report does not claim such a
selection policy has been implemented or would win.

## Reproduction

The [complete-route follow-up](neural-dispatch-outcome.md) removes the
four-anchor profiling step and compares a newly trained PyTorch policy with
a guarded simple rule. Its measured scope and qualification decision are
recorded separately from this prefix experiment.

Use a new output directory for each collection, training run, and confirmation.
The checked-in artifacts preserve the completed run. Python, PyTorch, and
`uv` use the existing pins in `.config/external-tools.json` and
`.config/model-training/`. They are development dependencies only.

```sh
pnpm run build
NWSAPI_REQUIRE_AC=1 pnpm run bench:planner:neural:collect assets/repo/bench/adaptive-new 4
pnpm run bench:planner:neural --input assets/repo/bench/adaptive-new --output assets/repo/bench/adaptive-model-new
NWSAPI_REQUIRE_AC=1 pnpm run bench:planner:neural:confirm assets/repo/bench/adaptive-new assets/repo/bench/adaptive-model-new assets/repo/bench/adaptive-integrated-new
```

The confirmation checks that the build matches collection and the emitted
model matches its recorded hash, then checks Python/JavaScript decisions
before timing. Use an optional final `repeat` argument for reversed fixture
order and 24ms rounds when an initial result justifies confirmation.

Generate the current report entirely from recorded inputs:

```sh
node scripts/repo/run.mts scripts/repo/bench/planner/adaptive/report.mts \
  assets/repo/bench/planner-adaptive-2026-10-05-r1 \
  assets/repo/bench/planner-scalar-2026-10-05-r1 \
  assets/repo/bench/planner-neural-2026-10-05-r1 \
  assets/repo/bench/planner-adaptive-model-2026-10-05-r1 \
  assets/repo/bench/planner-adaptive-integrated-2026-10-05-r1 \
  assets/repo/bench/survey-2026-10-03/neural-planner-2026-10-05.html
```

The [HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-planner-2026-10-05.html)
is served at the existing Portless host as `/neural-planner-2026-10-05.html`.
The earlier October 4 neural report remains archived and visibly superseded.
The October 3 actual-build optimization confirmations are separate evidence
and are not invalidated by the repaired neural experiment.
