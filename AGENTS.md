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
- Keep current behavior in a topic guide and historical decisions in the performance journal. Group benchmark artifacts by topic and measurement date. Link issue and PR numbers as provenance instead of using them as document names.

# Developer workflow

- Discover guided tasks with `node scripts/repo/develop/run.mts --list --json`. Present the ordered choices through the harness's own interface when the user needs guidance.
- Run a selected task with `node scripts/repo/develop/run.mts --task <id> --json`. Capture stdout as JSON and stderr as progress. Use the reported exit status and preserve existing authorization requirements.
- Keep persistent tasks in a managed session. See [the harness contract](docs/repo/development/toolchain.md#agent-harnesses) for task IDs, results, and shutdown behavior.

# Branches and worktrees

- Give each active branch its own worktree. Create new worktrees beneath `os.tmpdir()` using a unique directory. Do not place worktree checkouts inside this repository or its `.cache/` tree.
- Each PR uses a distinct branch. Each implementation agent owns a separate branch and worktree, including agents contributing to the same PR. Integrate their commits into the intended PR or target branch explicitly.
- Record the owning task, source branch, and intended merge target when creating a worktree. Do not switch branches in another task's checkout.
- Sweep owned temporary worktrees after their work is confirmed merged into the recorded target. Preserve active, dirty, unmerged, or uncertain worktrees. Follow the [worktree lifecycle](docs/fleet/development/worktrees.md), including squash-merge verification.

# Usability and shared agent guidance

- Use `.claude/skills/ui-usability/SKILL.md` for docs and web UI usability work, and `.claude/skills/developer-flow-usability/SKILL.md` for setup, CLI, and terminal workflow reviews. Follow the [shared usability guide](docs/fleet/design/usability.md).
- Preserve stable controls, focus, and content geometry. Keep essential outcomes available independently of brief visual cues. Report observed evidence separately from assumptions and unverified checks.
- Keep shared instructions about observable product needs. Do not put personal context in implementation, skills, or public reports.
- Author skills under `.claude/skills/`. Run `pnpm run setup:agents` to refresh ignored Claude and Codex/OpenCode aliases. Keep captures, logs, and downloads in `.cache/`. See [agent guidance](docs/repo/development/agent-guidance.md).

# Style

- Keep internal authored types in `.mts` files. Use `import type` and colocate types with their implementation when practical. Under `src/`, reserve `.d.ts` declarations for JavaScript loaders in `src/external/`.
- Mirror the owning source or script path beneath the test tier. For example, `src/adapter/jsdom.mts` uses `test/repo/integration/adapter/jsdom.test.mts`. Use a behavior name for suites that cover several modules without a single owner.
- Group repeated script prefixes under a singular directory. Keep the subject first, then name the environment or measurement. `scripts/repo/naming/check.mts` enforces the source and script layouts.

- Follow [code style practices](docs/fleet/style/practices.md) and [comment practices](docs/fleet/style/comments.md).
- Use braces and multiline bodies for conditionals and loops. Keep function complexity at or below 15 unless an existing, documented compatibility exception applies.
- Test behavior or parsed structures. Never test Markdown wording or source text. A stable heading or marker requires a local allowance with a reason.
- Keep new explanatory comments within two lines when possible. Explain the constraint in full sentences for a junior developer. Put investigation narratives in documentation.
