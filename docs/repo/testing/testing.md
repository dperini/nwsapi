# Testing

See [shared testing practices](../../fleet/testing/practices.md) for fixture isolation, behavioral assertions, and budget principles. The [test layout](layout.md) covers repository directories and fuzzing, and [upstream testing](upstream.md) covers WPT.

The unit suite has a **10,000ms wall-clock budget**, following socket-wheelhouse's fast tier. The budget includes runner startup, build, test collection, execution, and coverage reporting. It is separate from Vitest's per-test timeout: an external watchdog also stops synchronous hangs.

| Command                            | Scope                                     |             Budget |
| ---------------------------------- | ----------------------------------------- | -----------------: |
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

Coverage reports measure all published JavaScript in `src`, including the engine, adapter, and optional jQuery and traversal modules. The report rejects missing or unexecuted optional modules. Optional module tests execute the generated browser scripts in isolated VM contexts with real DOM fixtures. Both `import` and `require` execute the published CommonJS bytes; Vite does not transform those files. Browser and Node engine coverage are merged, and the report requires evidence from WPT and the Node adapter suite.

The recorded run measures 99.06% statements, 95.70% branches, 98.67% functions, and 99.03% lines. Both the engine and adapter exceed 95% on every metric; the adapter and both optional modules reach 100%. The enforced floors are 98% statements, functions, and lines, and 95.1% branches. The executable `bin/nwsapi.js` has a separate 100% statement, branch, function, and line assertion using raw V8 coverage from real processes. Those processes exercise the shebang, arguments, standard output, error output, and exit status from a foreign working directory. Compiler mode and flag permutations run in process to keep the integration tier short.

`normalizeCoverageLocations()` canonicalizes live and persisted reports before merging. JSON serializes infinite end columns as `null`; merging the two forms directly can count one statement twice. The dependency-free helper comes from [wheelhouse's fleet coverage utility](https://github.com/SocketDev/socket-wheelhouse/blob/main/template/base/universal/scripts/fleet/util/coverage-normalize.mts). Wheelhouse uses the same normalization for report merging and location alignment. Regression tests cover repeated merges and input immutability.

Fixture cleanup follows the [shared testing practices](../../fleet/testing/practices.md#isolate-fixtures-and-external-effects). The profiler defaults to a unique directory under `os.tmpdir()` and prints its output path. Requested profiling artifacts remain available for inspection. Explicit output paths and persistent reports remain caller-controlled.

Custom API regressions exercise registered selectors and operators across legacy and modern modes, cold and cached queries, DOM mutations, and callback termination. Adapter contract tests check throwing and `noexcept` behavior for all four query methods, independent fallback arrays and subject hints, and shared instances after cache clearing and synchronous mutations.

Optional module tests cover modern and legacy traversal, default and indexed navigation, every registered pseudo-class, selector composition, DOM mutations, positional resolver modes, callbacks, and invalid arguments. Browser checks load both modules after the regular and minified core and verify real layout visibility.

### Comparing the optional extension with jQuery

Run the direct comparison with the pinned, development-only jQuery 4.0.0 slim reference, loaded from the npm package through `jquery/factory-slim`:

```sh
pnpm run test:integration test/repo/integration/jquery-reference.test.mts
```

Given paragraphs `a, b, c, d` within a container, jQuery's positional selectors filter that ordered result set using zero-based indexes. `p:eq(1)` returns `b`, `p:even` returns `a, c`, and `p:odd` returns `b, d`. These are jQuery extensions, unlike the standard CSS `:nth-child()` selector, which counts siblings from one. See [jQuery's positional selector explanation](https://api.jquery.com/eq-selector/).

The comparison tests assert seven supported query patterns against the actual jQuery implementation, repeat warmed queries, and reorder the DOM. A separate test records five known differences with explicit expected results for both implementations. For a container holding `a, b, c, d`, with additional paragraphs outside it and only `a, c` carrying class `picked`:

| Query            | jQuery 4.0.0               | Optional extension                                    |
| ---------------- | -------------------------- | ----------------------------------------------------- |
| `p:eq(-1)`       | `d`                        | Empty                                                 |
| `p:first`        | `a`                        | Empty: the first paragraph is outside the container   |
| `p:last`         | `d`                        | Empty: the last paragraph is outside the container    |
| `p:nth(1)`       | `b`                        | `a`: document-wide same-tag index                     |
| `p:eq(1).picked` | Empty: `b` lacks the class | `c`: the class is filtered before the positional step |

These difference assertions document limitations, not successful compatibility checks. Full code coverage does not imply full jQuery compatibility. The original extension remains optional and jQuery is not a runtime dependency of NWSAPI.
