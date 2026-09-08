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
