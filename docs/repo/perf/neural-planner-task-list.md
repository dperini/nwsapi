# Neural planner implementation tasks

Read the [implementation guide](neural-planner-implementation.md) before
working on a phase. This checklist records execution state, not aspirations.
The user requested implementation on October 5, 2026 after reviewing the plan.

## Prompt for the implementing agent

Implement the neural planner guide in order in the v3 prerelease worktree.
Repair benchmark route forcing and cross-language fallback first. Preserve
old artifacts. Train only on versioned data with proved route identities.
Measure actual query time, including features and inference. Keep rejected
candidates offline. Follow the guide's concrete contracts, tests, and gates.
Commit logically and push authorized completed work to `prerelease/3.0.0`.
Read this checklist after compaction and update it with commands and evidence.
Do not claim that the existence of trained weights establishes a performance
improvement. Complete conditional phases only when their documented gate
justifies them, and record the decision when a phase is inapplicable.

## Execution checklist

- [x] Write detailed implementation guide and task list.
- [x] Phase 0: mark the October 4 neural comparison as superseded.
- [x] Phase 1: implement the TypeScript route contract and boundary vectors.
  Historical Python routing is retired. The adaptive policy has separate
  Python/JavaScript decision parity. A Python port of the reference route
  contract was not needed by this pilot and remains unimplemented.
- [x] Phase 2: force complete routes and verify actual execution in both hosts.
- [x] Phase 3: preserve measured baseline in a versioned dataset.
- [x] Phase 4: report development hindsight headroom and input limitations.
- [x] Phase 5: export scalar inference and check cross-language decisions.
  Full-query integration of the old network is not justified by route headroom.
- [ ] Phase 6: broader application corpus, structural probes, and sequences.
  The grouped 112-case development pilot is complete. Broader collection is
  deferred after its integrated-cost failure, not claimed as completed.
- [x] Phase 7: train and export a cost-sensitive development policy.
  This is a pilot with known fixture families, not independent validation.
- [x] Phase 8: implement exact continuation and evaluate the four-anchor pilot.
  It fails the performance gate. K=2/K=8 measurements and full compatibility
  qualification remain deferred. No adaptive code enters the runtime.
- [x] Phase 9: record the conditional decision. Route hint reuse is not
  justified by these measurements. Static host folding is implemented.
- [x] Phase 10: measure the emitted model inside actual queries and reject it.
  Independent release confirmation, cold-query timings, mutation timings,
  and full compatibility qualification are deferred because it fails.
- [x] Phase 11: publish understandable charts, raw inputs, and limitations.

## Run record

Starting checkout: `/tmp/nwsapi-v3-compiler-land`.
Starting branch: `prerelease/3.0.0`.
Starting implementation revision: `7e4a6e7`.
Old artifacts: `assets/repo/bench/planner-neural-2026-10-04/` and
`assets/repo/bench/planner-has-neural-2026-10-04/`.

Corrected development collection completed in
`assets/repo/bench/planner-has-2026-10-05-r1/`. Both hosts recorded AC power.
The exporter preserves actual baseline timings in format 2. Its dataset and
oracle diagnostics are in `assets/repo/bench/planner-neural-2026-10-05-r1/`.

## Record after each phase

For each phase append its status, commit, changed files, validation commands,
actual results, artifact paths and hashes, unresolved issues, and next task.
For a rejected candidate, record the failed gate and stop promoting it.
For an interrupted collector, record completed IDs and manifest identity.

The final report must distinguish shipped behavior from experiments and
include actual checks run. Use the guide's phase-specific acceptance criteria
instead of marking a phase complete because its files merely exist.

## October 5 implementation progress

- `90c4da3`: detailed guide and task list.
- `71b9d10`: visible correction on the historical HTML and Markdown reports.
- `a58fd9f`: complete AST route forcing, reference boundaries, and actual
  execution evidence. Five focused tests passed, including Chromium route
  checks. Typecheck and lint passed for that implementation.
- Corrected collection: 112 cases per host, 11 rounds of at least 20ms,
  actual baseline SHA-256
  `a9f16f10b9ef545ef204795444041c5c01c2a619bf4154572a26122b8ac263c1`.
- Conservative free-choice oracle: 1.027854x Chromium, 1.053251x `jsdom`.
  The current route-only design fails the two-host 1.05x headroom gate.
  Do not expand its hyperparameter search. Continue with scalar export and
  the adaptive strategy that can avoid the witness preflight.
- Scalar export: 10,096 JS input vectors, zero decision mismatches.
  Python parity: 10,084 nonzero-anchor vectors, zero decision mismatches,
  maximum score difference about 1.48e-7. Artifact directory:
  `assets/repo/bench/planner-scalar-2026-10-05-r1/`.
- Rotating-input Node diagnostic: generic 164.7ns, scalar 65.8ns, folded
  63.1ns, baseline 13.7ns. These are decision-only timings. Native browser
  timings are also saved in `overhead.json`.
- Adaptive prototype: exact prefix continuation and inverse suffix pass
  focused identity, ordering, and mutation checks. Its useful prefix
  observations agree for forced continue and switch actions.

## October 5 integrated result

The four-anchor collection is saved in
`assets/repo/bench/planner-adaptive-2026-10-05-r1/`. It measures six complete
pipelines on 112 cases per host. A free, perfect continuation choice still
costs 27.1% more query time in Chromium and 47.4% more in `jsdom` on this suite.
Those are optimistic hindsight diagnostics, not model measurements.

The new PyTorch policy has seven inputs, two ReLU hidden units, and one output.
Its selected checkpoint is epoch 49. The fitting/validation/development family
splits, nine model/seed candidates, cost weights, frozen measurements, saved
checkpoint, and emitted JavaScript are recorded in
`assets/repo/bench/planner-adaptive-model-2026-10-05-r1/`.
The initial exporter produced invalid NumPy scalar literals. It was repaired
and regenerated from the same saved weights before any integrated timing.
The final model has zero decision mismatches on 10,216 parity inputs.

`assets/repo/bench/planner-adaptive-integrated-2026-10-05-r1/` measures the
actual emitted model with all prefix, feature, inference, and completion work
included. AC power was recorded before and after both hosts.

| Host | Baseline/model speed ratio | Extra model query time | Worst time ratio | Gate |
| --- | --- | --- | --- | --- |
| Chromium | 0.706732× | 41.5% | 14.533× | Fail |
| `jsdom` | 0.585947× | 70.7% | 32.197× | Fail |

Each host has 112 known development cases and 11 rotating rounds of at least
20ms. The model improves on the experimental prefix rule by speed ratios of
1.096× and 1.253×, respectively, but that rule also loses to current v3.
These measurements establish rejection on this suite, not generalization to
unseen applications. The first six implementation commits through `0a636c6`
are on `prerelease/3.0.0`. Commit `2a99a49` adds the trainer and integrated
measurement tooling. Commit `3530053` preserves the collection, trained model,
and actual-query measurements. The documentation is committed separately.

The [current HTML report](../../../assets/repo/bench/survey-2026-10-03/neural-planner-2026-10-05.html)
shows lower-is-faster bars. The [outcome and commands](neural-planner-outcome.md)
record what is implemented and what was deferred. Current v3 runtime code
and its earlier guarded optimizations are unchanged by this experiment.

Final implementation checks: TypeScript no-emit check, repository lint,
script-entrypoint check, and whitespace check pass. The adaptive parity check
was rerun after adding artifact hash validation. The served report returned
HTTP 200, its bars were inspected in Chromium, and the Portless URL was opened.
Full WPT and release qualification were not rerun for this offline experiment.
