# Test performance

This document covers the time and memory used to run tests. Keep shared test-runner guidance under `docs/fleet/testing/`. Keep repository-specific commands, configurations, and measured results under `docs/repo/testing/`.

## Measure the test runner

Start with the [Vitest performance guide](https://vitest.dev/guide/improving-performance). Inspect the run summary to distinguish environment creation, module loading, setup, and test execution. Timings collected across parallel workers do not add up to elapsed time.

Measure the complete repository test command as well. Record the runtime, runner version, machine, test count, elapsed time, and peak memory. Compare the same tests under each configuration. Measure fresh runs and cached runs separately.

## Remove repeated work first

Count Git subprocesses, file reads, fixture construction, and cleanup alongside test durations. Inspect calls made through helpers and loops. A source search alone does not tell you how often the work runs.

Test policy combinations through the existing decision function when the process boundary is not part of the behavior. Keep CLI tests for exit codes, arguments, environment handling, and other process contracts. Do not replace the production function with a copy inside the test.

Create read-only Git seeds once per suite. Copy a seed into a private temporary directory for each test that changes files or refs. Give mutating tests private origins too, and update remote URLs in each copy. Preserve the commit graph, identities, hooks, ignored files, and remote behavior that the test needs.

Read stable fixture files and parse unchanged configuration once within the owning suite or invocation. Batch Git queries when one command can answer several questions. Remove unused commit lookups and repeated directory scans. Keep cache lifetimes explicit so a test that changes an input cannot receive an earlier result.

Shared setup must outlive its consumers. Clean up a suite seed after the suite finishes, and clean up each mutable copy after its test. Follow the [temporary fixture guidance](isolation.md#use-ostmpdir-for-temporary-fixtures).

## Check the affected work while iterating

Run the tests affected by the changed behavior first. Include callers and shared dependencies when selecting those tests. Changes to the runner, common setup, configuration, or coverage provider can affect the whole lane.

A focused run provides evidence for its selected cases. Run the complete affected lane before claiming that the lane meets its budget. Keep required full-suite checks in CI. Reuse a previous result only when the relevant source, configuration, dependencies, and runtime still match.

## Keep the lanes within their budgets

The fleet uses three speed lanes. A lane groups tests by execution needs and expected cost. The medium lane uses the configuration key `mid`.

| Lane | Permanent target | Suitable work |
| --- | --- | --- |
| Fast | 10s | These tests exercise focused behavior with inexpensive setup. |
| Medium (`mid`) | 30s | These tests need heavier fixtures or isolation for shared state. |
| Slow | 60s | These tests exercise integration boundaries and external-suite wrappers. |

The values come from `scripts/fleet/constants/test-budget.mts`. Runtime enforcement must use that source. A lane is not the same as a directory or worker pool. Each repository defines the mapping and must retain every required test.

Reduce repeated work before moving a slow test. Move it when its resource requirements belong in another lane. Raising a limit or excluding cases does not make a suite faster.

Measure the scope that the budget governs, including startup and reporting within that scope. A JavaScript timer cannot interrupt a blocked synchronous child-process call. Enforce the deadline through the runner's subprocess controls and retain diagnostics when it expires.

A diagnostic run that completes after the deadline is still over budget. A temporary coverage allowance does not change the permanent target or the ordinary test limit. Report the target and effective allowance separately, and use the ordinary command to establish a passing gate result.

## Change the expensive part

The [Vitest guide](https://vitest.dev/guide/improving-performance) describes several options. Limit discovery with `test.dir` when unrelated directories add search work. Compare worker pools and file parallelism. Inspect environment creation costs for DOM tests. Consider persistent caches for repeated runs and sharding for large suites. Sharding divides test files between runs, whose reports must then be merged.

Check each option against the repository's installed `vitest` version. Use repository scripts to run experiments, and keep exact flags with the repository. More workers can increase memory use and competition for CPU time. Measure both costs before changing the shared configuration.

## Preserve isolation and coverage

Disabling isolation lets files share environment and module state. Apply it only to tests that can safely share that state. Separate tests with different isolation needs through test projects. Vitest's guide explains the available configuration choices.

Follow the [isolation practices](isolation.md) before changing worker settings. Check cleanup and repeat the suite to look for state left by earlier tests. A successful faster run alone does not prove that shared state is safe.

Keep every required suite in CI. Verify that merged shard reports contain the expected tests and that coverage still includes required modules. A reduced test count is not a performance improvement.

## Split large lanes into shards

A shard runs part of a lane's test inventory. The lane still defines the kind of work and its budget. Use sharding to distribute that work across available machines or processes.

The [Vitest sharding guide](https://vitest.dev/guide/improving-performance#sharding) explains `--shard`, blob reports, and report merging. Vitest divides test files between shards. It does not split the individual cases inside one file.

Use the same revision, configuration, runtime, and selected inventory for every shard. Verify that their combined inventory contains each intended file exactly once for each required test environment. Keep reports separate by shard and environment until merging them.

Budget workers across the whole machine. Four shards with four workers each can compete for resources as sixteen workers, in addition to their runner processes. Compare elapsed time and peak memory before increasing parallelism.

Give each shard private temporary directories and mutable services. Fixed ports, cache paths, Git origins, and output files can collide even when tests run in separate processes. Follow the [parallel execution rules](isolation.md#choose-parallel-execution-by-resource-ownership).

Collect failed-shard diagnostics and merge reports only after accounting for every expected shard. Keep coverage inclusion rules and thresholds unchanged. Follow the [coverage guidance](coverage.md) when combining shard results. A missing shard or incomplete report cannot count as a successful lane. Report total lane completion time as well as individual shard durations.

## Record the result

Record the configuration change, measured improvement, memory cost, and correctness checks in `docs/repo/testing/`. Keep rejected configurations with the reason they failed. Follow the [testing practices](practices.md) for execution budgets and coverage checks.
