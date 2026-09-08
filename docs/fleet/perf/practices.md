# Performance practices

Use these practices when measuring speed or memory use. Keep the commands and results for each repository in `docs/repo/perf/`.

## Organize the documentation

Follow the [documentation practices](../development/documentation.md) for ownership, names, prose, and generated data.

Use `practices.md` for instructions on how to measure and evaluate changes. Put shared instructions in `docs/fleet/perf/`. Put repository-specific commands and measurement rules in `docs/repo/perf/practices.md`.

Use `docs/repo/perf/design.md` to explain how the implementation works and why it uses that design. Use `docs/repo/perf/journal.md` to record experiments, results, and decisions. Give each experiment a descriptive title. Do not organize the journal by work sessions or audit rounds.

Keep maintained `README.md` files at the repository root. Preserve filenames owned by upstream projects. Store recorded benchmark inputs and generated reports under `assets/repo/bench/`, and track them in Git. Generate reports from the recorded inputs so another developer can check the calculations.

## Choose what to measure

State the expected improvement before changing the code. Name the operation being measured, such as construction, the first query, or repeated queries. Use inputs that represent normal use and inputs that stress the changed behavior.

Keep the runtime, machine, inputs, and measurement steps comparable. Alternate the old and new implementations in the same process when possible. Report the median, the variation between samples, and the sample count. The median is the middle value after sorting the samples.

Load varying inputs that the runtime cannot replace with a constant result. Check correctness outside the timed operation. Run profiling separately from timing because the profiler adds work of its own.

## Separate allocation from retained memory

Allocation is the memory requested while an operation runs. Retained memory is the memory still reachable after the operation finishes. A heap snapshot shows retained objects and the references that keep them alive. Allocation sampling estimates the memory requested during execution. Whether it includes objects that were later collected depends on the profiler settings.

Neither measurement describes all memory used by the process. Native code and other runtime resources can use memory outside the JavaScript heap.

Let cleanup tasks and observers finish before measuring retained memory. Inspect the references that keep objects alive. Memory above the starting value does not, by itself, prove a leak.

Record which modules and caches the measured instances share. Preserve source hashes, runtime versions, input descriptions, and raw samples with the results. A source hash identifies the exact code that produced a measurement.

## Record the decision

For each experiment, describe the hypothesis, measured operation, command, result, decision, and correctness checks. Record rejected ideas and inconclusive results with the evidence that ruled them out. State any follow-up work separately from completed work.

Explain where each result applies. Do not add percentages measured against different starting versions. Do not present an improvement to one operation as an improvement to the whole application. Report sampled allocation as an estimate.

The [performance rules](../agents.md/performance.md) explain how to order checks and avoid unnecessary work. The [parser journal](https://github.com/SocketDev/ultrathink/blob/main/docs/repo/perf/journal.md) provides examples of recorded experiments.

For long-running tasks, follow the [asynchronous work guidance](async-work.md) to account for promise handlers, queued results, and cleanup. For build measurements, follow the [cache guidance](caching.md) to separate reuse from fresh work.

Use the [profiling guidance](profiling.md) to choose measurements and verify that the intended processes were captured.
