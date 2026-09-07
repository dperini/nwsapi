# Repository tests

- `unit/` tests focused selector behavior and helpers.
- `integration/` tests jsdom integration and development commands.
- `e2e/` tests browser behavior, published packages, and WPT.

Run `pnpm run test:unit`, `pnpm run test:integration`, or `pnpm run test:e2e`.
Run `pnpm run test:coverage` for Node and WPT coverage.

Development commands live in `scripts/repo/`. The older HTML suites remain
under `test/`; the pristine WPT checkout remains under `upstream/wpt/`.
