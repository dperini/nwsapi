# Prose

- Use exact package names in inline code when referring to libraries, including this project and its competitors: `nwsapi` and `@asamuzakjp/dom-selector`. Keep version labels outside the code span unless writing a package specifier.
- Reserve branded capitalization such as NWSAPI for project names and graphic titles. Treat both libraries consistently in package comparisons.
- Prefer separate sentences or a natural conjunction over semicolons joining prose clauses. Preserve code, direct quotations and required syntax.
- Follow each benchmark chart with a context paragraph explaining its cases and measurement scope. Put shared methodology in expandable details above the charts.
- Attach abbreviated units to numbers, such as `20ms`, `40px` and `1.5MB`. Keep a space before spelled-out units.

# Documentation

- Use `README.md` only at the repository root for maintained documentation. Preserve upstream-owned filenames in vendored fixtures.
- Keep repository-specific documentation in `docs/repo/` and reusable fleet guidance in `docs/fleet/`.
- Use `perf/` for performance and `testing/` for testing in both trees. Use descriptive document names instead of section README files.
- Keep measured outcomes, commands, and performance journals with the repository. Shared measurement and testing practices belong in the fleet tree.
- Keep benchmark measurements and generated reports under `assets/repo/bench/`, tracked by Git. Generate derived reports from recorded inputs rather than storing result JSON under `docs/`.

# Style

- Keep internal authored types in `.mts` files. Use `import type` and colocate types with their implementation when practical. Under `src/`, reserve `.d.ts` declarations for JavaScript loaders in `src/external/`.
- Mirror the owning source or script path beneath the test tier. For example, `src/adapter/jsdom.mts` uses `test/repo/integration/adapter/jsdom.test.mts`. Use a behavior name for suites that cover several modules without a single owner.
- Group repeated script prefixes under a singular directory. Keep the subject first, then name the environment or measurement. `scripts/repo/check/naming.mts` enforces the source and script layouts.

- Follow [code style practices](docs/fleet/style/practices.md) and [comment practices](docs/fleet/style/comments.md).
- Use braces and multiline bodies for conditionals and loops. Keep function complexity at or below 15 unless an existing, documented compatibility exception applies.
- Test behavior or parsed structures. Never test Markdown wording or source text. A stable heading or marker requires a local allowance with a reason.
- Keep new explanatory comments within two lines when possible. Explain the constraint in full sentences for a junior developer. Put investigation narratives in documentation.
