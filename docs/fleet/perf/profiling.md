# Profiling practices

Use a profile to identify where an operation spends time or retains memory. Measure the operation before changing it, and keep timing measurements separate from profiling overhead. Follow the [measurement practices](practices.md).

## Match the tool to the question

A CPU profile samples the code running on a processor. It helps locate expensive functions, but time waiting on a subprocess, file operation, or timer may not appear as CPU work. Compare samples with elapsed time and observed external operations.

A heap snapshot records objects retained at that point and the references that keep them alive. Allocation sampling estimates memory requested during execution. Neither alone describes all process memory. Include native allocations and worker memory when they are part of the workload.

Capture the processes that perform the work. Profiling only the parent can miss expensive test workers or child tools. Verify that requested profiling options reached each process and that the expected output files exist before interpreting the result.

## Compare equivalent work

Record the revision, runtime, inputs, worker settings, and cache state. Keep baseline and candidate profiles. Change one measured cause at a time, and compare the same workload under similar machine load.

Inspect repeated setup, file reads, subprocess launches, and allocation before adding concurrency or caches. Caches need an explicit lifetime and invalidation rule. The [cache guidance](caching.md) explains how to preserve correctness when inputs change.

Test idle, active, and cleaned-up states for memory investigations. Include slow consumers, stalled operations, and cancellation where relevant. The [asynchronous work guidance](async-work.md) covers retained handlers, queues, and cleanup.

## Keep evidence with its owner

Store large raw profiles in an owned temporary directory or the documented ignored artifact location. Put commands, source identity, findings, and decisions in `docs/repo/perf/`. Store tracked benchmark observations and generated summaries in `assets/repo/bench/`.

Test-runner profiling belongs under [testing performance](../testing/performance.md). Keep its suite inventory, lane budgets, and coverage scope attached to the result so an omitted test cannot look like a speed improvement.
