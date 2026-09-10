# Test performance

This document covers the time and memory used to run tests. Keep shared test-runner guidance under `docs/fleet/testing/`. Keep repository-specific commands, configurations, and measured results under `docs/repo/testing/`.

Fleet commands below require the corresponding fleet scripts. Repositories with their own runners can apply the same practices without changing their tooling or fleet membership. Keep repository measurements in `docs/repo/testing/journal.md`.

## Check measured budget headroom

Use comparable timing data to decide when a passing command needs optimization. Collect at least ten successful, complete runs with `--timing-only`. Keep the command, coverage mode, inputs, machine load, and cache conditions comparable. The helper preserves ordinary coverage and adds no CPU, heap, or debug profiler in this mode.

```sh
pnpm run test:profile --timing-only --runs 10 --command='["node","scripts/fleet/test.mts","--lane","fast"]'
```

The report marks its timing scope as `whole-command`. Use a budget that governs that complete command, including startup and reporting. Read the existing lane measurement report when the budget covers a narrower interval. For a documented 10s budget covering the whole supplied command, assess the saved report with:

```sh
pnpm run check:test-budget-headroom --report /path/to/report.json --budget-ms 10000 --scope whole-command
```

This command runs `scripts/fleet/check/test-budget-headroom.mts`. It requires complete, successful, unprofiled runs and clean source identities that match before and after collection. Dirty, unknown, changed, or incomplete source states cannot establish comparable evidence. The collector checks source state once at each boundary, outside the measured command interval.

Inherited CPU, heap, or debug profiler flags and the helper's known profiling preload prevent an unprofiled evidence claim. Ordinary loaders, network guards, and coverage remain part of the supplied runtime. Confirm that the command does not start a diagnostic profiler internally because the helper cannot prove that from its arguments.

Sample standard deviation measures the spread of observed runtimes. The prediction bound targets one next run. The check uses `mean + 1.834 * sampleStandardDeviation * sqrt(1 + 1 / sampleCount)`, following the [NIST prediction-bound formula](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/predboun.htm). The one-sided 95% level is a policy choice. Measured variation determines the margin.

The factor `1.834` rounds above the 95th percentile of Student's t distribution with nine degrees of freedom. It stays conservative for at least ten samples, as shown in the [NIST t table](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm). The bound assumes independent, stable, approximately normal timings. Review these assumptions because the check cannot prove them from a timing vector. A bound or observed maximum at or above the budget produces `measured-risk`.

| Result                  | Exit status | Action                                                                             |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `estimated-headroom`    | 0           | Keep the report with its assumptions and continue ordinary budget enforcement.     |
| `measured-risk`         | 1           | Use the recovery runbook to lower runtime, even if the latest ordinary run passed. |
| `insufficient-evidence` | 2           | Resolve the reported evidence gap before making a statistical headroom claim.      |

The helper reports sample standard deviation after at least two successful unprofiled samples. The headroom policy requires at least ten. A single run provides no measured variation estimate. Prediction reports remain diagnostic and carry `gateEvidence: false`. Ordinary gates keep their existing deadlines and do not start extra runs or profiling automatically.

## Recover an exceeded budget

If installed, use the `writing-fast-tests` skill and its `references/reviewing-slow-suites.md` guide. The skill lives under `.claude/skills/fleet/writing-fast-tests/`. Run commands from the repository root. These commands use the fleet entrypoints below. Check `package.json` first because a repository may wrap them or own its runner. Substitute the failed lane for `fast`.

| Command                                                      | Entry script                     | When to run it                                                                 |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm test --lane fast`                                      | `scripts/fleet/test.mts`         | Reproduce the ordinary lane deadline.                                          |
| `pnpm test --lane fast --reporter=verbose`                   | `scripts/fleet/test.mts`         | Locate expensive test files and cases.                                         |
| `pnpm run cover --lane fast`                                 | `scripts/fleet/cover.mts`        | Reproduce the lane with coverage and its normal gate.                          |
| `DEBUG=vitest:coverage pnpm run cover --measure --lane fast` | `scripts/fleet/cover.mts`        | Capture coverage diagnostics in the measurement suite logs.                    |
| `pnpm run cover --measure --lane fast`                       | `scripts/fleet/cover.mts`        | Let JavaScript coverage finish after a deadline prevents complete diagnostics. |
| `pnpm run test:profile --help`                               | `scripts/fleet/test/profile.mts` | Show options for timing and profiling an existing repository command.          |

1. **Reproduce the failed command.** Keep its revision, Node version, worker settings, test inventory, coverage provider, and coverage inclusion rules. Record elapsed time and peak memory. Separate fresh and cached runs, and avoid competing builds or test runs. The ordinary fleet test command runs without coverage. Use the coverage entrypoint when investigating a coverage failure.

2. **Measure the unchanged command, then capture profiles.** The profiling script accepts the executable and arguments as a JSON array. These commands time the ordinary fast lane three times, then capture its runner and worker profiles:

   ```sh
   pnpm run test:profile --timing-only --runs 3 --command='["node","scripts/fleet/test.mts","--lane","fast"]'
   pnpm run test:profile --vitest-workers --command='["node","scripts/fleet/test.mts","--lane","fast"]'
   ```

   The script creates a private directory under `os.tmpdir()` and prints its `report.json` path. The report records source state before and after collection, each run's output log, timing range, requested and executed arguments, runtime, exit status, profiles, and sampled hotspots. A leading `node` uses the profiling script's Node executable. Repeated runs stop on the first failure and preserve its exit status. All timings are diagnostic. Keep before and after reports separate, and compare CPU samples with elapsed time and subprocess durations because I/O waits can dominate.

3. **Keep coverage enabled when it caused the overrun.** Pass the failing coverage command in `--command`. For fleet coverage, use this completion diagnostic when the enforced deadline prevents complete profiles:

   ```sh
   pnpm run test:profile --vitest-workers --command='["node","scripts/fleet/cover.mts","--measure","--lane","fast"]'
   ```

   `--vitest-workers` adds a temporary `.mts` preload through [`NODE_OPTIONS`](https://nodejs.org/api/cli.html#node_optionsoptions). The preload exposes CPU flags through `process.execArgv`, which `vitest` 5 retains when building each project's worker options. This includes inline projects with `extends: false`. The helper preserves project configuration and command arguments. It records the preload path as `profilingPreload` and the added environment options as `profilingNodeOptions`.

   Inspect the report's worker evidence and sampled test files for every selected project. `workerProfiles` includes other Node threads, such as capacity calibration workers. `vitestWorkerProfiles` counts profiles with `vitest` worker source evidence, recorded per profile as `vitestWorkerEvidence`. This evidence comes from worker startup modules or both test-file and `vitest` runner frames. `--vitest-workers` requires this evidence. Calibration threads alone cannot satisfy it.

   Wrappers must preserve `NODE_OPTIONS`, and project-specific profiler overrides can prevent capture in the owned directory. Missing `vitest` worker evidence fails diagnostics. A worker count alone cannot prove that every project was profiled. Follow the [`vitest` profiling guide](https://vitest.dev/guide/profiling-test-performance).

   Add `DEBUG=vitest:coverage` to the coverage measurement command and inspect `suite.main.log` and any `suite.isolated.log` under `.cache/fleet/coverage/measurement/lane-fast/`. Normal coverage output is filtered. The coverage measurement report has `measurement: true`, `gateEvidence: false`, and `thresholdsEvaluated: false`. Read its measured scope and excluded phases. A completed diagnostic run cannot establish a passing gate.

4. **Remove the repeated work you measured.** Count Git commands, file reads, parsing, fixture construction, and cleanup. [Batch stable reads and reuse immutable seeds](#remove-repeated-work-first) within one suite or invocation. Compute the changed-file set once per invocation and reuse it across checks that use the same Git state. Keep mutable copies private and invalidate results when inputs change. Compare call counts and elapsed time after each change.

5. **Consolidate tests around distinct behavior.** Test policy combinations through production decision functions. Keep process tests for distinct argument, exit, environment, and I/O contracts. Share expensive setup only when cases can safely share it. Preserve assertions, required scenarios, and the coverage denominator. [Run affected tests first](#check-the-affected-work-while-iterating), then run the full affected lane before assessing its budget.

6. **Change scheduling only after measuring its cost.** Compare one setting at a time. The fleet test wrapper accepts `--maxWorkers=2` and `--sequence.shuffle --sequence.seed=42` for worker and order experiments. Configure pool, `fileParallelism`, isolation, and `experimental.importDurations.print` in the owning `vitest` project configuration because this wrapper does not forward those flags. Inspect import durations when module loading dominates. Follow the [isolation rules](isolation.md) before sharing state and the [sharding rules](#split-large-lanes-into-shards) before splitting a lane. Repeat runs to detect leaked state and CPU or memory contention.

7. **Verify the final lane without profiling.** Run the original test and coverage commands with their normal deadlines and thresholds. Confirm the required inventory and coverage denominator still match. Record the command, before and after timing, memory, call counts, and correctness checks in `docs/repo/testing/`. Keep the permanent target visible when an existing temporary coverage allowance applies.

## Profile a repository with its own runner

Use `--cwd` to run the supplied command in another repository. It defaults to the caller's working directory. A repository keeps its own launcher and dependencies. For example, from a sibling checkout with the profiling script installed, these commands use the `nwsapi` unit runner:

```sh
pnpm run test:profile --cwd ../nwsapi --timing-only --runs 3 --command='["node","scripts/repo/run.mts","scripts/repo/test.mts","unit","--coverage"]'
pnpm run test:profile --cwd ../nwsapi --vitest-workers --command='["node","scripts/repo/run.mts","scripts/repo/test.mts","unit","--coverage"]'
```

Use `--output-dir` to choose the parent of a fresh report directory. Keep the generated profiles with `report.json`. The helper adds profiling flags only in profile mode and records them separately. It preserves the command's lane, coverage, isolation, and deadline settings. Missing or invalid profiles fail diagnostics. A command failure keeps its original nonzero exit status even when profile capture also fails.

Hotspot durations are sampled self time within one process or thread. They do not add up to suite elapsed time. The reader restores chronological order when V8 emits negative time deltas and reports `negativeDeltaCount` and `reorderedSampleCount`. It preserves the raw profiles. `unattributedMs` records time before the first sample. Read each run's `run.log` for the original runner output, including test counts, coverage results, and memory measurements. The report exposes its location as `logPath`. Run the ordinary repository gate separately after the optimization.

## Measure the test runner

Start with the [`vitest` performance guide](https://vitest.dev/guide/improving-performance). Inspect the run summary to distinguish environment creation, module loading, setup, and test execution. Timings collected across parallel workers do not add up to elapsed time.

Measure the complete repository test command as well. Record the runtime, runner version, machine, test count, elapsed time, and peak memory. Compare the same tests under each configuration. Measure fresh runs and cached runs separately.

## Remove repeated work first

Count Git subprocesses, file reads, fixture construction, and cleanup alongside test durations. Inspect calls made through helpers and loops. A source search alone does not tell you how often the work runs.

Test policy combinations through the existing decision function when the process boundary is not part of the behavior. Keep CLI tests for exit codes, arguments, environment handling, and other process contracts. Do not replace the production function with a copy inside the test.

Create read-only Git seeds once per suite. Copy a seed into a private temporary directory for each test that changes files or refs. Give mutating tests private origins too, and update remote URLs in each copy. Preserve the commit graph, identities, hooks, ignored files, and remote behavior that the test needs.

Read stable fixture files and parse unchanged configuration once within the owning suite or invocation. Batch Git queries when one command can answer several questions. Remove unused commit lookups and repeated directory scans. Keep cache lifetimes explicit so a test that changes an input cannot receive an earlier result.

Shared setup must outlive its consumers. Clean up a suite seed after the suite finishes, and clean up each mutable copy after its test. Follow the [temporary fixture guidance](isolation.md#use-ostmpdir-for-temporary-fixtures).

## Reuse modules without sharing mutable state

Load a module once when its factory creates independent state for each test. Repeatedly deleting `require.cache` entries or calling `vi.resetModules()` can repeat module loading and evaluation. Measure that work before using module resets as routine setup.

Keep module resets when a test exercises import-time configuration, module-level state, or initialization itself. Use an isolated process or VM realm when the test requires different globals or missing runtime APIs. A fresh factory instance does not isolate module-level state.

Share parsed fixtures only when the shared input stays unchanged. Give each mutating test its own document, engine, or other mutable copy. Keep a fresh browser window when the behavior depends on window state. Read stable files and parse unchanged source once within the owning suite.

Module reuse and Node's compile cache are separate controls. Preserve the compile-cache settings required for accurate coverage when measuring a module-reuse change.

## Close fixtures at their ownership boundary

Register cleanup when creating a fixture so failed assertions cannot skip it. Close test-owned DOM windows, servers, workers, and temporary resources after their test. Close shared fixtures after the last test that uses them.

Clear fixture registries after cleanup so the registry does not retain completed tests' resources. Retained windows can keep listeners, timers, and DOM trees alive. Measure peak memory as well as elapsed time when fixing missing cleanup.

Run affected tests with shuffled order after changing shared setup or cleanup. Then run the complete affected lane with its usual isolation and coverage settings. A shuffled run can expose leaked state, but it does not prove that every order is safe.

## Check the affected work while iterating

Run the tests affected by the changed behavior first. Include callers and shared dependencies when selecting those tests. Changes to the runner, common setup, configuration, or coverage provider can affect the whole lane.

A focused run provides evidence for its selected cases. Run the complete affected lane before claiming that the lane meets its budget. Keep required full-suite checks in CI. Reuse a previous result only when the relevant source, configuration, dependencies, and runtime still match.

## Keep the lanes within their budgets

The fleet uses three speed lanes. A lane groups tests by execution needs and expected cost. The medium lane uses the configuration key `mid`.

| Lane           | Permanent target | Suitable work                                                            |
| -------------- | ---------------- | ------------------------------------------------------------------------ |
| Fast           | 10s              | These tests exercise focused behavior with inexpensive setup.            |
| Medium (`mid`) | 30s              | These tests need heavier fixtures or isolation for shared state.         |
| Slow           | 60s              | These tests exercise integration boundaries and external-suite wrappers. |

The values come from `scripts/fleet/constants/test-budget.mts`. Runtime enforcement must use that source. A lane is not the same as a directory or worker pool. Each repository defines the mapping and must retain every required test.

Reduce repeated work before moving a slow test. Move it when its resource requirements belong in another lane. Raising a limit or excluding cases does not make a suite faster.

A subprocess test with an external timeout belongs in a lane that supports process isolation. Preserve its process boundary, deadline, exit checks, and assertions when moving it. A full benchmark fixture can belong outside the fast lane when its size is part of the behavior being checked. Keep small policy and parser tests in the fast lane when they do not need those resources.

Report lane movement separately from reduced work. Moving a test can lower fast-lane time without lowering total execution time. Verify the combined test inventory and cumulative coverage after the move.

Measure the scope that the budget governs, including startup and reporting within that scope. A JavaScript timer cannot interrupt a blocked synchronous child-process call. Enforce the deadline through the runner's subprocess controls and retain diagnostics when it expires.

A diagnostic run that completes after the deadline is still over budget. A temporary coverage allowance does not change the permanent target or the ordinary test limit. Report the target and effective allowance separately, and use the ordinary command to establish a passing gate result.

## Change the expensive part

The [`vitest` guide](https://vitest.dev/guide/improving-performance) describes several options. Limit discovery with `test.dir` when unrelated directories add search work. Compare worker pools and file parallelism. Inspect environment creation costs for DOM tests. Consider persistent caches for repeated runs and sharding for large suites. Sharding divides test files between runs, whose reports must then be merged.

Check each option against the repository's installed `vitest` version. Use repository scripts to run experiments, and keep exact flags with the repository. More workers can increase memory use and competition for CPU time. Measure both costs before changing the shared configuration.

## Preserve isolation and coverage

Disabling isolation lets files share environment and module state. Apply it only to tests that can safely share that state. Separate tests with different isolation needs through test projects. The `vitest` guide explains the available configuration choices.

Follow the [isolation practices](isolation.md) before changing worker settings. Check cleanup and repeat the suite to look for state left by earlier tests. A successful faster run alone does not prove that shared state is safe.

Keep every required suite in CI. Verify that merged shard reports contain the expected tests and that coverage still includes required modules. A reduced test count is not a performance improvement.

## Split large lanes into shards

A shard runs part of a lane's test inventory. The lane still defines the kind of work and its budget. Use sharding to distribute that work across available machines or processes.

The [`vitest` sharding guide](https://vitest.dev/guide/improving-performance#sharding) explains `--shard`, blob reports, and report merging. The runner divides test files between shards. It does not split the individual cases inside one file.

Use the same revision, configuration, runtime, and selected inventory for every shard. Verify that their combined inventory contains each intended file exactly once for each required test environment. Keep reports separate by shard and environment until merging them.

Budget workers across the whole machine. Four shards with four workers each can compete for resources as sixteen workers, in addition to their runner processes. Compare elapsed time and peak memory before increasing parallelism.

Give each shard private temporary directories and mutable services. Fixed ports, cache paths, Git origins, and output files can collide even when tests run in separate processes. Follow the [parallel execution rules](isolation.md#choose-parallel-execution-by-resource-ownership).

Collect failed-shard diagnostics and merge reports only after accounting for every expected shard. Keep coverage inclusion rules and thresholds unchanged. Follow the [coverage guidance](coverage.md) when combining shard results. A missing shard or incomplete report cannot count as a successful lane. Report total lane completion time as well as individual shard durations.

## Compare the same work

Alternate before and after runs in fresh processes. Keep the runtime, engine build, worker count, test inventory, coverage settings, and budget fixed. Change one setup or scheduling choice at a time. Keep profiles separate from the unprofiled timing samples.

Compare coverage totals and covered entries, not only rounded percentages. Record the median and range alongside raw samples. Overlapping ranges or a slower after run limit the conclusions you can draw from a lower median.

Use the CI machine's results when assessing its budget. A faster local run does not establish CI headroom. Keep lane-placement changes separate when comparing runs with different inventories.

## Record the result

Record the configuration change, measured improvement, memory cost, and correctness checks in `docs/repo/testing/`. Keep rejected configurations with the reason they failed. Follow the [testing practices](practices.md) for execution budgets and coverage checks.
