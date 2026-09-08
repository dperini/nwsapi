# Performance measurement

These practices apply across fleet repositories. Repository-specific workloads, commands, measurements, and implementation decisions belong under `docs/repo/perf/`.

## Define the measured work

State the hypothesis and the exact phase being measured. Separate construction, cold execution, warm execution, retained memory, and allocation over time. Use representative input distributions and verify correctness in the measured workload.

Keep runtime, machine, fixtures, and measurement scope comparable. For timing, alternate variants in one process where practical and report medians, variation, and sample counts. Inputs should vary enough that the runtime cannot reduce the benchmark to constant work. Run profiling separately from timing because instrumentation changes execution costs.

This follows the [Wheelhouse performance guidance](https://github.com/SocketDev/socket-wheelhouse/blob/main/docs/fleet/agents.md/performance.md) and the experiment structure used by the [parser journal](https://github.com/SocketDev/ultrathink/blob/main/docs/perf/parser-journal.md).

## Separate allocation from retention

A heap snapshot describes retained objects. Allocation sampling estimates bytes allocated during execution, and its inclusion of collected objects depends on the profiler settings. Neither is automatically a measurement of process RSS or native memory.

Allow asynchronous cleanup and observers to settle before retention measurements. Inspect retaining paths and object categories alongside aggregate heap totals. Memory remaining above a baseline is not sufficient evidence of a leak.

Describe sharing and warmup assumptions. A measurement that amortizes one module across many instances cannot be directly applied to independently loaded modules. Preserve source hashes, runtime versions, fixture descriptions, and raw samples with the result.

## Record decisions by experiment

Give each journal entry a descriptive topic, hypothesis, measured phase, command, result, decision, correctness constraints, and any follow-up. Keep rejected ideas and inconclusive results with the evidence that ruled them out. Organize entries around behavior rather than work-session or iteration numbers.

Report where a result does not apply. Do not add percentages from different baselines, turn an isolated fast path into a whole-application claim, or report sampled allocation as an exact count. Improve the implementation only when evidence supports the tradeoff.
