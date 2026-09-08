# Test layout

Keep tests owned by the repository under `test/repo/`. Wheelhouse distributes shared runners under `scripts/fleet/` and shared setup and helpers under `test/fleet/`. A test of fleet tooling still belongs to the repository that owns the test. The [test ownership rules](../agents.md/test-layout.md) define this boundary.

## Choose a directory

Use the following directories when the repository needs them. A small suite does not need every directory.

| Directory | Purpose |
| --- | --- |
| `common/` | This directory holds helpers used by several suites. Existing fleet tooling uses `_shared/` for this purpose. |
| `unit/` | These tests check focused behavior with controlled dependencies in the current process. |
| `integration/` | These tests check interactions between components, files, subprocesses, or packages. |
| `e2e/` | These tests exercise a complete user flow through a CLI, browser, installed package, or release artifact. |
| `isolated/` | These tests require a separate process or runner configuration. Use this directory when the repository defines that tier. |
| `fixtures/` | This directory holds test inputs and expected outputs. |
| `fuzz/` | These tests use generated inputs to find failures. Follow the [fuzzing practices](../fuzzing/practices.md) and keep small regression inputs. |
| `scripts/` | This directory holds test setup and execution helpers. |

For TypeScript tests, use `test/repo/<suite>/<area?>/<name>.test.mts`. Add an area when it helps readers find related tests. Keep helpers used by only one suite beside that suite.

A directory name does not create process isolation. Configure workers according to the resources each test changes. Shared helpers do not form a separate test tier. Keep fixture data outside test discovery.

Document the repository's suites, commands, and time budgets in `docs/repo/testing/`. Follow the [testing practices](practices.md) when writing assertions and choosing fixtures.
