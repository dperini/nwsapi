# CI unit shards

Before this change, a diagnostic unit run covered 380 files and 2,320 tests.
A single unit process
can exceed the unchanged 10,000ms budget before finishing the inventory on the
Linux CI runner. Full Node plans therefore run the unit suite across 16 external
Vitest shards. Each shard keeps the ordinary 10,000ms watchdog and the unit
configuration, including per-file isolation and network denial.

The shard jobs use the same revision and install. Vitest selects files with
`--shard=<index>/16`. The existing developer commands remain unsharded:
`pnpm test` and `pnpm run test:unit` still run the complete unit suite in one
process.

Each shard writes a JSON envelope under the runner's temporary directory. It
records the shard index, shard count, commit, workflow run and attempt, start,
finish and elapsed times, exit status, and Vitest JSON report. The workflow
uploads one artifact per shard. The final report prints lane elapsed time and
each shard duration.
The final Node gate downloads the reports and compares their combined file
inventory with every current `test/repo/unit/**/*.test.mts` path. It fails when
a shard report is absent or duplicated, a file is missing or unexpected, a
report belongs to another revision or workflow attempt, a test fails, or a
pending or todo test appears. The inventory check complements the matrix job
results, so a missing artifact cannot turn a partial run into a passing Node
gate.

The full Node plan runs integration once with its existing 60,000ms budget.
Targeted test plans continue to run only their affected files. Coverage remains
in `pnpm run cover`; shard JSON reports do not merge or replace coverage data.
