# Test performance journal

Reusable guidance lives in [shared test performance](../../fleet/testing/performance.md). This journal records `nwsapi` configurations, experiments, and measured results.

## Reproduce the unit measurement

Run the ordinary command with coverage enabled:

```sh
pnpm run test:unit --coverage
```

This invokes `scripts/repo/run.mts` and `scripts/repo/test.mts`. The wrapper disables Node's compile cache for precise V8 coverage. The unit lane uses two thread workers. Its 10s budget includes the build, runner startup, tests, and coverage reporting.

For a focused investigation, append test paths to the same command. Vitest's `--reporter=json` and `--outputFile` options can retain individual test timings and coverage maps in an owned directory under `os.tmpdir()`. Keep the complete lane measurement as the evidence for meeting its budget.

## Remove repeated setup and parsing

The attribute-string tests use one `jsdom` window to parse an unchanged fixture. Each test clones the document and creates its own engine. Attribute changes and compiled-selector caches remain private to that case. The suite closes the shared window after all cases finish. Tests that need window state or browser APIs retain their own fixtures.

The API documentation generator searches the parsed code tree until it reaches the engine factory or adapter class. It no longer collects every descendant before finding those nodes. Documentation tests read unchanged inputs and render their common output once. Cases that change the source still parse and validate that changed input.

## Measured result

The comparison used Node 26.5.0, `vitest` 5.0.0, and macOS 26.6.2 on an Apple M3 Max with 36GiB of memory. Both sequential runs used the full unit lane with coverage, two thread workers, and the Node compile cache disabled. The baseline was commit `92ebae1`. Both runs selected the same 67 files and passed the same 629 tests.

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Budgeted unit process | 6124ms | 5060ms | 17.4% lower |
| Reported maximum RSS | 1651.8MiB | 1498.1MiB | 9.3% lower |

The runner supplied the elapsed times. `/usr/bin/time -l` supplied maximum RSS. These are local measurements from one pair of complete runs. They do not establish the same improvement on every CI machine. The coverage file list, statement maps, function maps, branch maps, and covered entries matched between runs. The comparison covers the unit lane. CI merges additional suites before enforcing the final coverage thresholds.

Focused CPU profiles covered 198 tests across the same four files before and after the change. They captured the coordinator, both test workers, and the build subprocess. Aggregate sampled self-time in the API generator fell from 190ms to 15ms. Generated `jsdom` interface code fell from 455ms to 118ms. These samples span parallel workers and must not be added together as elapsed time.

The attribute cases also pass with shuffled execution using seed 9173:

```sh
pnpm run test:unit test/repo/unit/attribute-parse-error.test.mts \
  --sequence.shuffle --sequence.seed=9173
```

## Keep full benchmark fixtures in the integration lane

The practical benchmark validation constructs three full documents and compares native queries with the built engine. It runs in `test/repo/integration/benchmark-fixtures.test.mts`. The small timing, cache-source, and independent-world checks remain in the unit lane.

On Linux CI, the full-fixture test took 1340ms when the unit process exceeded its unchanged 10s budget by 73ms. Moving that test preserves every selector assertion and the production benchmark fixture sizes. It changes which lane owns the work. It does not establish a reduction in total test execution time. Cumulative coverage still includes both lanes.

## Reuse the legacy module and close its fixtures

The legacy host suite used to delete the built engine from Node's module cache before creating each fixture. The engine factory already creates independent engine state. The suite now loads that module once and calls the factory for each host. Tests for missing globals still evaluate the engine in a separate VM realm. Each fixture window is closed after its test, including cases that previously left the window open.

The [setup comparison](../../../assets/repo/bench/test-legacy-setup.json) records three alternating before and after runs. Only the legacy test file changed between variants. Both variants used the same candidate engine, all 664 tests in 76 files, two thread workers, disabled Node compile caching, JSON reporting, coverage, and the unchanged 10000ms limit. The measurements ran locally with Node 26.5.0 and no concurrent benchmark jobs.

| Complete unit process | Before | After |
| --- | ---: | ---: |
| Median | 4499ms | 3723ms |
| Minimum | 3662ms | 3662ms |
| Maximum | 4665ms | 5185ms |

These values include startup, the build, tests, and coverage reporting. The median is 17.3% lower, but the ranges overlap and one after run is slower than every before run. Three local samples do not establish stable Linux CI headroom. The legacy suite's own median falls from 351.21ms to 310.20ms. Every coverage denominator and covered count agrees between variants.

To reproduce the setup comparison, keep the current engine and other tests fixed. Alternate the legacy test file from `886765c` with the changed file and run `pnpm run test:unit --coverage --reporter=json --outputFile=<owned-temporary-path>` in fresh processes. Restore the changed file even if a run fails. The report records both fixture hashes, the engine hash, all test inventories, and coverage summaries. The lane subsequently moved the parser-stall case to integration, so reproducing the original 664-test unit inventory also requires its original placement.

The parser-stall regression runs a child process with an external timeout. It now lives at `test/repo/integration/bench/parser-stall.test.mts`, matching the script it tests. The same malformed selector, SyntaxError assertion, and process deadline remain. This changes lane ownership rather than removing work. The final local coverage run passed 663 unit tests in 3455ms and 148 integration tests in 7050ms. Cumulative coverage also includes modern and legacy WPT. Remote CI remains the evidence for the Linux lane budget.
