# Test budgets

The unit suite has a **10,000 ms wall-clock budget**, following socket-wheelhouse's fast tier. The budget includes runner startup, build, test collection, execution, and coverage reporting. It is separate from Vitest's per-test timeout: an external watchdog also stops synchronous hangs.

| Command                            | Scope                                     |             Budget |
| ---------------------------------- | ----------------------------------------- | -----------------: |
| `pnpm test` / `pnpm run test:unit` | Unit suite                                |          10,000 ms |
| `pnpm run test:integration`        | Subprocess and isolated integration suite |          60,000 ms |
| `pnpm run test:node`               | Both tiers, each enforced separately      | 10,000 + 60,000 ms |
| `pnpm run test:upstream`           | WPT browser run                           |         600,000 ms |

`pnpm run test:coverage`, used by CI, runs both Node tiers under their usual budgets, merges their coverage, then runs WPT under its separate budget. Coverage does not increase the unit allowance. WPT also retains its 90,000 ms per-page timeout.

Budgets live in `scripts/repo/lib/test-budget.mts`. Exceeding a budget fails the command and terminates its workers on POSIX systems. The runner prints elapsed milliseconds and the limit for each tier. Improve fixtures and startup overhead when the unit tier exceeds its ceiling; tests requiring subprocesses or shared module mutations belong in integration. No tests are omitted from CI by changing tiers.

Unit tests use shared thread workers. Keep DOM state local to each fixture and restore spies and environment changes. Tests that replace CommonJS module exports run in isolated integration processes. Direct Vitest invocations are useful for debugging but do not install the external watchdog; use the package scripts for budget enforcement.

The repository also ignores files by default. `.gitignore` opts in maintained file types within source directories and names root metadata explicitly. Add an opt-in when introducing a new maintained file type or directory; generated output, dependencies, and scratch directories stay ignored.
