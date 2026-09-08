# Testing practices

These practices apply across fleet repositories. Each repository documents its commands, execution budgets, coverage requirements, and fixtures under `docs/repo/testing/`.

## Test behavior and stable contracts

Exercise the actual implementation. Assert returned values, exit codes, state changes, and structured output. Avoid coupling a behavioral test to incidental wording or source layout. Reimplementing production logic inside a test can let both copies share the same defect.

Use the [shared test layout](layout.md) to separate suites, reusable helpers, and fixture data.

## Isolate fixtures and external effects

Keep mutable state local to each fixture. Restore mocks, environment changes, and shared module state. Use isolated processes when a test cannot safely share a worker.

Create temporary fixtures with a unique directory under the operating system's temporary directory and register cleanup. Redirect child-process caches and configuration into the fixture while preserving access to the intended toolchain. Availability probes need the same isolation as the commands they precede.

Keep tests independent of live external services. Use local fixtures or controlled servers for network behavior. Dependency installation and pinned upstream checkout setup are separate from test execution. See [Wheelhouse's network isolation guidance](https://github.com/SocketDev/socket-wheelhouse/blob/main/docs/fleet/agents.md/no-live-network-in-tests.md).

## Enforce budgets without losing coverage

A suite's wall-clock budget includes startup, build, collection, execution, and reporting. Per-test timeouts do not bound the whole command or reliably stop synchronous hangs. Run the repository's budgeted entry points for verification.

Improve startup and fixture costs when a fast tier exceeds its budget. Put tests that require subprocesses or shared-state mutation in a suitable isolated tier, and keep that tier in CI. Changing tiers must not silently remove coverage.

Coverage measures execution, not semantic compatibility. Verify required modules participate in the report, retain regression cases for behavior changes, and distinguish measured coverage from claimed API compatibility.

## Normalize coverage reports

Canonicalize live and persisted coverage locations before merging. JSON serializes infinite end columns as `null`, so merging the two forms directly can count one statement twice. The [Wheelhouse coverage normalization helper](https://github.com/SocketDev/socket-wheelhouse/blob/main/template/base/universal/scripts/fleet/util/coverage-normalize.mts) handles this boundary. Verify repeated merges and input immutability. Repositories define their own coverage targets, required modules, and enforcement commands.
