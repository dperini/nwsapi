# Coverage

Coverage records which parts of the source ran during tests. Use it to find missing cases, then write assertions that check the expected behavior. Executing a line does not prove that it works correctly.

## Combine coverage across the complete run

Cumulative coverage combines the evidence from the required fast, medium, and slow lanes, their shards, and supported child-process or browser runs. A function covered in one lane remains covered in the combined report. No single lane needs to repeat every case from the others.

Merge source locations and counters before calculating percentages. Do not average percentages from separate reports. If two suites cover different halves of the same file, the combined result can cover the whole file even though each suite reports 50%.

Use the fleet merge helpers to normalize paths and source locations. Count each source item once in the denominator. Different providers can describe the same source with different statement or branch boundaries, so their maps must be reconciled before merging. See the [report normalization practices](practices.md#check-coverage-data-before-trusting-the-percentage).

Combine only compatible reports from the intended revision, source inventory, and run configuration. Cumulative coverage does not mean keeping old hits after the source changes. Verify that every required lane and shard produced a complete report. A timeout, missing child report, or conversion failure cannot become a successful aggregate.

Include owned source files that no test imports so uncovered files remain visible. Keep third-party implementation code outside the owned-source inventory. Document generated-source mappings and exclusions with the repository. The [Vitest coverage guide](https://vitest.dev/guide/coverage#including-and-excluding-files-from-coverage-report) explains source inclusion settings.

## Avoid counting installed copies twice

Wheelhouse can measure both a canonical template file and its installed copy. The fleet merge helper combines these entries only after confirming that their source bytes are identical. Different implementations remain separate. Do not merge files merely because their names match.

Use this normalized report when ranking uncovered functions or updating a coverage badge. Otherwise, an uncovered copy of already-tested source can look like missing coverage. Check the report's source revision before publishing results from a cache.

## Enforce thresholds on the combined result

A threshold is the minimum accepted percentage for a metric. Track statements, branches, functions, and lines separately. A high line percentage can hide missing decision branches.

Apply the repository's aggregate thresholds after the required reports have been merged. Retain any separate per-file or module requirements. A focused test run is useful during development, but it does not replace the complete coverage gate.

Follow the [coverage ratchet](../agents.md/coverage-ratchet.md): retain measured gains by raising committed thresholds through the existing tooling. Do not lower thresholds to make a failing change pass. Keep exact targets and commands in the repository configuration and `docs/repo/testing/`.

Time budgets and coverage thresholds check different properties. A complete report can meet coverage thresholds while exceeding its lane budget. A fast run can still miss required coverage. Report both outcomes and publish success reports only from a complete passing gate.

## Make methods directly testable

Export source functions, helpers, classes, and the types needed to call them. Keep methods directly accessible to tests. Do not introduce TypeScript `private` methods or JavaScript `#private` methods. Extract internal decision logic into exported functions when that gives tests a simpler entry point.

Source exports do not require adding every helper to the package's public export map. Keep the supported package API deliberate while allowing repository tests to import the owning source module. Follow the [export rules](../agents.md/export-and-no-any.md), and preserve useful types instead of bypassing access with `any` casts.

Test decision logic directly and retain integration tests for the behavior that depends on a real process or component boundary. Direct access should make assertions clearer and reduce repeated startup work.

## Mock dependencies and block external network access

Use mocks or injected dependencies for clocks, randomness, network clients, credential providers, and other external effects when the test can preserve the relevant contract. Keep the implementation being tested real. A test that mocks its own decision logic only proves that the mock returns the chosen value.

Make dependency failures deterministic. A controlled dependency can return a timeout or malformed response without waiting for a real outage. Use real temporary files when filesystem behavior matters, and use local servers when transport behavior matters.

Tests must not contact third-party services. Block unexpected external connections as well as providing mocks. A missing mock should fail locally. Follow the [network rules](../agents.md/no-live-network-in-tests.md), and restore mocks during cleanup according to the [isolation practices](isolation.md).

## Read the environment through helpers

Use the existing environment getters instead of reading `process.env` throughout application logic. Helpers such as `isCI()` give tests a controlled point for changing the observed environment. Add a getter at the environment boundary when none exists.

Repositories using `@socketsecurity/lib` can use its `env/rewire` helpers, including `setEnv()`, `clearEnv()`, and `resetEnv()`. Use the dependency variant already selected by the repository. Reset overrides after each test. Overrides can still be shared module state, so tests changing the same override must not overlap in one worker.

Keep direct environment access inside the environment helper or process-launch boundary. For subprocess tests, pass a private environment object to the child. Do not change the parent process's environment to configure an independent child. Avoid reading environment values at module load when tests or callers need later changes to take effect.

## Use narrow, explained coverage exceptions

Use an ignore comment only for a small boundary that cannot reasonably be exercised through a mock, injected dependency, or supported integration test. Possible cases include runtime glue for an external native library or a failure path that would require terminating the test host. Name the constraint and the tests that cover the surrounding behavior.

An external dependency does not justify ignoring the wrapper around it. Test the wrapper's arguments, returned values, and error handling with a controlled dependency. Exclude external implementation files through the source inventory instead of ignoring owned business logic.

For a runner using `c8`, the [c8 documentation](https://github.com/bcoe/c8#ignoring-uncovered-lines-functions-and-blocks) defines `/* c8 ignore next */` and paired `/* c8 ignore start */` and `/* c8 ignore stop */` comments. Prefer the smallest affected statement or branch and put a concrete reason beside it. Avoid whole-file exclusions for one difficult case.

Vitest's V8 provider documents `v8` ignore comments, while its Istanbul provider uses `istanbul` comments. TypeScript transformations can remove comments, so preservation may be necessary. Check the [provider guidance](https://vitest.dev/guide/coverage#ignoring-code) and the installed version before choosing syntax.

Run the actual coverage command and inspect the source map and denominator after adding an exception. Confirm that only the intended code was excluded. Record exceptions for review and remove them when the boundary becomes testable. A higher percentage caused by hiding code is not additional test coverage.
