# Test layout

Directories below are relative to `test/repo/`. See [testing commands and budgets](testing.md) and [shared testing practices](../../fleet/testing/practices.md).

- `unit/` tests focused selector behavior and helpers.
- `integration/` tests jsdom integration and development commands.
- `e2e/` tests browser behavior, published packages, and WPT.

Run `pnpm run test:unit`, `pnpm run test:integration`, or `pnpm run test:e2e`.
Run `pnpm run cover` for Node and WPT coverage.

Development commands live in `scripts/repo/`. The older HTML suites remain
under `test/`. The pristine WPT checkout remains under `upstream/wpt/`.

## Fuzzing

`pnpm run test:fuzz` runs Vitiate's coverage-guided selector targets for 15 seconds each.
Set `FUZZ_TIME_MS` to change the budget. Generated valid selectors are checked against an independent engine before and after DOM mutation. Arbitrary bytes exercise parser error handling.
Agent sessions use minimal harness output and suppress routine progress, using the same Socket Lib-derived `isAgent` helper as unit tests. Interactive runs retain normal progress. Set `FUZZ_VERBOSE=1` for detailed output. Failures and saved input paths are always reported.
`pnpm run test:fuzz:replay` reruns saved seeds, coverage corpus, crashes and timeouts from `.vitiate/`.
This is a cumulative corpus replay, not a reconstruction of the last run's random execution order.
CI uploads that directory even when a fuzz target fails. To replay a CI run, extract its artifact into `.vitiate/` in this checkout and run the replay command.
Keep minimized findings as ordinary regression tests before clearing local corpus files.
The fuzz lane instruments the built engine, while regular tests remain on the ordinary Vitest configuration.
The substring-based unsafe-eval detector is disabled because compiled selectors legitimately contain input text inside escaped literals. Parser exceptions, result checks, prototype-pollution detection and the other default detectors remain active.
