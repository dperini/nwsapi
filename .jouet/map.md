# Map

- `src/`: selector engine implementation, split by parser, compiler, matching, collections, adapters, and initialization.
- `test/repo/unit/`: unit tests, organized to mirror `src/` and repository tooling. Run with `pnpm run test:unit`.
- `test/repo/integration/`: integration tests, including package, runtime, and setup behavior.
- `test/repo/e2e/`: browser and package end-to-end tests. Browser setup uses `pnpm run setup:browser`.
- `test/repo/e2e/upstream/` and `upstream/wpt`: selected Web Platform Tests and their source submodule. Run with `pnpm run test:wpt` after WPT setup.
- `scripts/repo/`: repository setup, test, build, release, and development commands. `scripts/repo/run.mts` is the shared script runner.
- `.github/workflows/`: CI workflows. `ci.yml` runs repository checks, affected runtime tests, and the full unit suite.
- `.config/`: pinned tools, test configuration, and generated schemas. Update generated schemas through `pnpm run gen:schemas`.
- `docs/repo/`: contributor and project documentation.

The package entry points and exports are declared in `package.json`; build outputs are generated under `dist/` and should not be edited by hand. Selector behavior changes usually need source updates under `src/` and matching tests under `test/repo/`. WPT source is maintained in the `upstream/wpt` submodule.
