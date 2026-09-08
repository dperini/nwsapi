# Test ownership and enforcement

Each repository owns its tests under `test/repo/`. Wheelhouse distributes shared runners under `scripts/fleet/` and shared setup and helpers under `test/fleet/`. The [test layout](../testing/layout.md) explains the directories. The [testing practices](../testing/practices.md) explain how to choose assertions and fixtures.

## Keep test cases with their owner

Wheelhouse's tests of shared scripts, hooks, lint rules, and release tooling stay in Wheelhouse's `test/repo/`. They do not ship in the fleet bundle. Member tests remain with the member.

The distributed trees contain no `*.test.*` files. Tests that exercise template code import the canonical source under `template/base/universal/`. Shared helpers and setup files do not form a separate test tier.

## Test behavior and code structure

Assert returned values, exit codes, structured identifiers, and state changes. Avoid assertions tied to incidental wording. Do not embed authorization phrases in tests. When the identity of a rule matters, assert its stable machine-readable identifier.

Execute the actual implementation. A test that copies the implementation can repeat its defect. For code-structure checks, use a parser and inspect the relevant syntax nodes. Matching source text cannot establish whether a call executes. Follow the [test quality practices](../testing/quality.md).

## Isolate processes and files

Follow the [isolation practices](../testing/isolation.md) for temporary directories, subprocess environments, shared state, and cleanup.

Build a child's environment in this order:

1. Remove inherited values that could redirect the tool.
2. Set the fixture's home, cache, configuration, and working paths.
3. Apply the values required by the individual test.

Run availability probes with the same isolation as the commands they precede. A version or help command may initialize caches. Verify that the required tool still runs after changing its environment. Do not accept an unexpected skip as a successful test.

The module `scripts/fleet/prose/test-isolation-law.mts` defines the shared isolation clauses and `ISOLATED_ENV_VARS`. Use that module when implementing or reviewing a helper. Tools can read variables that take precedence over `HOME`, so a temporary home alone is insufficient.

## Use the existing enforcers

| Enforcer | Responsibility |
| --- | --- |
| `prefer-vitest-guard` | It routes JavaScript and TypeScript tests through the repository's test wrapper. |
| `no-vitest-double-dash-guard` | It rejects a separator that can prevent the intended file argument from reaching the test runner. |
| `no-test-in-scripts-guard` | It keeps test suites out of the scripts tree. |
| `test-script-defers-guard` | It requires package test scripts to use the supported wrapper. |
| `cascaded-fleet-trees-have-no-tests` | It rejects test cases in distributed tooling trees. |
| The cascade manifest | It includes shared test helpers and setup without distributing Wheelhouse test cases. |
| `test-env-scrub-order-guard` | It checks supported cases where environment cleanup removes an isolation value after setup. |
| `test-spawns-are-isolated` | It reports source patterns that may violate subprocess isolation. |

The source scanner is advisory and has limited pattern recognition. A clean scan does not prove that subprocesses leave the checkout and user environment unchanged. Verify that behavior with isolated fixtures and appropriate assertions.
