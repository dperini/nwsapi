# Testing practices

Test the behavior that callers depend on. Check returned values, exit codes, structured output, and state changes. A test that copies the production algorithm can repeat the same defect and still pass.

## Test stable behavior

Use the [test quality guidance](quality.md) when reviewing assertions, checking code structure with parsers, or consolidating cases.

Avoid assertions tied to incidental wording or source layout. When text is part of a public contract, test that contract explicitly. Keep regression cases for behavior changes, even when the coverage percentage stays the same.

Use the [test layout](layout.md) to place suites and helpers. Follow the [isolation practices](isolation.md) for tests that change files, environment variables, or process state.

Use the [fuzzing practices](../fuzzing/practices.md) for generated inputs, independent checks, saved corpora, and reproducible failures. Keep minimized findings as focused regression tests.

## Control external dependencies

Use local fixtures or controlled local servers for network behavior. Block unexpected external connections so a missing mock fails the test. Dependency installation and pinned upstream checkout setup happen separately from test execution. The [network rules](../agents.md/no-live-network-in-tests.md) describe the required controls.

## Keep the full command within its budget

Follow the [test performance guidance](performance.md) when profiling the runner or changing its configuration.

A suite's elapsed time includes startup, builds, test discovery, execution, and reporting. A timeout on one test does not limit the whole command. It may also fail to interrupt code that blocks the current process.

Use the repository's test entry points. If a fast suite exceeds its budget, inspect startup and fixture costs. Move a test to another tier only when that tier fits its resource needs and remains part of CI.

## Check coverage data before trusting the percentage

Follow the [coverage guidance](coverage.md) for cumulative reports, thresholds, testable methods, mocks, environment helpers, and justified exceptions.

Coverage shows which code ran. It does not prove that the behavior is correct. Verify that required modules appear in the report and follow the [coverage rules](../agents.md/coverage-ratchet.md).

Normalize recorded source locations before merging coverage reports. For example, JSON turns an infinite end-column value into `null`. Merging the original and serialized forms without normalization can count one statement twice. The shared `scripts/fleet/util/coverage-normalize.mts` helper handles this conversion. Check that repeated merges produce the same result and leave their inputs unchanged.

A cached successful type check also needs validation. A declaration-only change must invalidate any earlier result that depended on it. Test a successful check, a declaration change that should fail, and a restored declaration that should pass. Keep compiler versions and reproductions in the repository's testing documents.
