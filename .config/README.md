# Code style

Run `pnpm format`, `pnpm lint`, and `pnpm type` before submitting changes.
Formatting and linting share their file list in `scripts/lib/tooling-scope.mts`.
Generated JavaScript and upstream fixtures are excluded.

Use two spaces, single quotes, no semicolons, and regex literals for static
patterns. Lint checks correctness, suspicious code, imports, and TypeScript.
Use default imports for `node:path`, `node:crypto`, and `node:os`.

Package scripts use `scripts/run.mts` to share an OS-temporary Node compile cache
with child processes. Existing cache settings and opt-outs are preserved.
Coverage runs disable the cache for accurate measurements.
The launcher permits pnpm, aube, and direct Node runs. Other package managers
receive a pnpm command to run instead. Published package consumers are unaffected.

The runtime keeps older syntax and compiler conventions. The adapter uses inline
type imports so its build remains CommonJS. Extension property quotes prevent the
build from introducing object shorthand into ES5 output. Build tests enforce
these compatibility requirements.

Type assertions remain allowed while the runtime and host declarations are
incrementally typed. Promise checks remain enabled.
