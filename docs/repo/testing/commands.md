# Test commands and budgets

See [shared testing layout](../../fleet/testing/layout.md) and [practices](../../fleet/testing/practices.md). Repository details are in [coverage](coverage.md), [fuzzing](fuzzing.md), [test performance journal](journal.md), and [upstream testing](upstream.md).

The unit suite has a **10,000ms wall-clock budget**, following the fleet's fast tier. The package runner enforces the [shared time-budget practices](../../fleet/testing/performance.md#keep-the-lanes-within-their-budgets).

| Command                            | Scope                                     |            Budget |
| ---------------------------------- | ----------------------------------------- | ----------------: |
| `pnpm test` / `pnpm run test:unit` | Unit suite                                |          10,000ms |
| `pnpm run test:integration`        | Subprocess and isolated integration suite |          60,000ms |
| `pnpm run test:node`               | Both tiers, each enforced separately      | 10,000 + 60,000ms |
| `pnpm run test:wpt`                | WPT browser run                           |         600,000ms |

`pnpm run cover`, used by CI, runs both Node tiers under their usual budgets, merges their coverage, then runs WPT under its separate budget. Coverage does not increase the unit allowance. WPT also retains its 90,000ms per-page timeout.

Budgets live in `scripts/repo/lib/test-budget.mts`. Exceeding a budget fails the command and terminates its workers on POSIX systems. The runner prints elapsed milliseconds and the limit for each tier. Improve fixtures and startup overhead when the unit tier exceeds its ceiling; tests requiring subprocesses or shared module mutations belong in integration. No tests are omitted from CI by changing tiers.

Unit tests use shared thread workers. Keep DOM state local to each fixture and restore spies and environment changes. Tests that replace CommonJS module exports run in isolated integration processes. Direct Vitest invocations are useful for debugging but do not install the external watchdog; use the package scripts for budget enforcement.

`pnpm run type` checks the engine, adapters, CLI, repository scripts, and tests.
The local TypeScript configuration uses the same strict checks as Wheelhouse.
These checks require explicit handling of missing array entries, nullable DOM results, and optional properties.
They also reject implicit `any` types and unused declarations.
NWSAPI keeps its own configuration and scripts.
Type checks run without an incremental cache so they recheck changes to shared declarations.

## Repository suites

`test/repo/unit/` covers selector behavior and helpers. `test/repo/integration/` covers the `jsdom` adapter and development commands. `test/repo/e2e/` covers browsers, published packages, and WPT. Reusable DOM fixtures live in `test/repo/fixtures/`, and fuzz targets live in `test/repo/fuzz/`.

Run `pnpm run test:e2e` for the complete browser, package, and WPT lane. Development commands live in `scripts/repo/`. Older HTML suites remain under `test/`, and the pristine WPT checkout remains under `upstream/wpt/`.


## Integrated host workload

`node scripts/repo/bench/jsdom-workload.mts --host <prepared-jsdom> --wpt <pinned-wpt>` runs the Range mutation page with both engines and records host lifecycle measurements. The command uses fresh processes and local resource interception. It checks the test count and every subtest result before reporting timing. Add `--profile <temporary-prefix>` to save separate CPU profiles and include their summaries in the generated report. See the [performance journal](../perf/journal.md#host-workload-and-adapter-classification) for preparation and measurement boundaries.

The isolated package test also installs `@testing-library/dom` 10.4.1 and exercises role, label, and test-ID lookups against the packed adapter. Its temporary installation stays outside the repository.

## Compare first-result ID lookups

Build the baseline revision separately and keep its engine file outside this checkout. Then build the candidate and run:

```sh
node scripts/repo/bench/first-id.mts --baseline /absolute/path/to/baseline/nwsapi.js
```

The script writes `assets/repo/bench/first-id.json`. It compares document, connected shadow-root, and element-scoped queries. Exact attributes have compound-selector and class-query controls. Each row records correctness before timing. A baseline that returns the wrong node receives no timing result. Warm measurements reuse an engine. Cold measurements use fresh engines with construction outside the timer. Run this comparison without concurrent test or benchmark jobs.

## Compare complex sibling and descendant queries

Use a prepared `jsdom` checkout with its dependencies installed:

```sh
node scripts/repo/bench/complex-selectors.mts --host /absolute/path/to/jsdom
```

The script writes `assets/repo/bench/complex-selectors.json`. It runs fresh worker processes for direct and public-host queries, checks fixture-derived results, records mutation controls, and collects separate CPU profile summaries when passed `--profile`. Run it without concurrent test or benchmark jobs. The [performance journal](../perf/journal.md#complex-sibling-and-descendant-queries) explains the fixtures, integration contract, and remaining gaps.

## Compare general `:has()` queries

Keep a separately built baseline engine outside this checkout, build the candidate, and run:

```sh
node scripts/repo/bench/has.mts --baseline /absolute/path/to/baseline/nwsapi.js --profile
```

The script writes `assets/repo/bench/has.json`. It checks node identity and order before recording warm and first-query timings. Cases cover many matches, a late match, misses, branch lists, siblings, positional selectors, and the existing direct-child shortcut. Five rounds alternate engine order. Optional CPU profiles run after the timed batches. Run this comparison without concurrent test or benchmark jobs. The [performance journal](../perf/journal.md#adjacent-class-reads-and-general-has-queries) records the measured gains and limits.

## Measure populated `:has()` caches

```sh
node scripts/repo/bench/has-memory.mts --baseline /absolute/path/to/baseline/nwsapi.js
```

The script writes `assets/repo/bench/has-memory.json`. It uses three alternating rounds in native Chromium pages. Each engine receives 512 distinct relative plans, enough additional plans to pass the cache capacity, and another batch to check continued churn. It measures retained JavaScript heap after forced garbage collection, checks removed nodes through weak references, and measures explicit cache clearing. A separate warm-query allocation sample includes collected objects. Whole-page heap includes code and DOM, so compare stage differences and retain the measurement limits in the [journal](../perf/journal.md#sibling-has-scope-and-cache-allocation).

## Compare ancestor reuse

Save a built CommonJS baseline before building the candidate. The production comparison uses the baseline build from `05824bf`. Keep saved builds in an operating-system temporary directory.

```sh
pnpm run build
node scripts/repo/bench/ancestor-reads.mts --baseline /absolute/path/to/before/nwsapi.js --output assets/repo/bench/ancestor-production-timing.json
node scripts/repo/bench/ancestor-reads.mts --baseline /absolute/path/to/before/nwsapi.js --memory --output assets/repo/bench/ancestor-production-memory.json
node scripts/repo/bench/ancestor-browser.mts --baseline /absolute/path/to/before/nwsapi.js --output assets/repo/bench/ancestor-production-browser.json
```

These commands compare unmodified compiled resolvers from both builds. They record both build hashes and verify node identity, suffix and prefix mutations, sibling reordering, and reversed candidate order. The browser also checks detached-node collection. Timing excludes compilation and candidate lookup. Run Node timing separately from `--memory`, which samples allocation and records post-GC heap across three rotating rounds. Add `--single` to remove consecutive ancestor reuse opportunities. Use separate output files for those controls.

The earlier `--classes`, `--prefix`, `--shared`, and `--inline` flags are historical prototype comparisons. Their checked rewrites require the original compiler shape, so reproduce them with the pre-integration build instead of applying them to the optimized engine. The [journal](../perf/journal.md#integrate-ancestor-reuse-into-the-compiler) records the adopted change and the public-host measurements.
