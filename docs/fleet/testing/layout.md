# Test layout

Use `test/repo/` for repository-owned tests and supporting files. Use `test/fleet/` for shared runners, setup, and helpers distributed by the fleet. Repositories own their product tests, including tests of shared tooling. See the [Wheelhouse ownership convention](https://github.com/SocketDev/socket-wheelhouse/blob/main/docs/fleet/agents.md/test-layout.md).

| Directory      | Purpose                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `common/`      | Reusable test helpers, fixture builders, assertions, and setup used across suites. Existing fleet tooling may call this `_shared/`. |
| `unit/`        | Focused in-process behavior with local, controlled dependencies.                                                                    |
| `integration/` | Interactions between components, subprocesses, filesystems, and package or tool boundaries.                                         |
| `e2e/`         | Complete user-facing flows through a browser, CLI, installed package, or release artifact.                                          |
| `fixtures/`    | Input data and reusable test environments. Keep expected outputs with their relevant fixtures.                                      |
| `fuzz/`        | Coverage-guided or generated-input targets when the repository uses fuzzing.                                                        |
| `scripts/`     | Test setup and execution helpers where required by the runner.                                                                      |

Use `test/repo/<suite>/<area?>/<name>.test.mts` for test files. Add an area only when it makes related cases easier to navigate. Create shared directories when they have actual consumers. Small suite-specific helpers and fixtures can stay beside their tests.

The repository's testing documents define which suites exist, how they run, and their execution budgets. A directory name alone does not guarantee process isolation. Configure workers according to the state and external resources each test changes.

Shared helpers are not a separate test tier. Keep fixture data separate from executable test discovery, and retain minimized fuzz findings as regression cases. Follow the [testing practices](practices.md) for assertions, isolation, cleanup, and coverage.
