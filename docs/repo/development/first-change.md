# Make your first change

Use this path to prepare a checkout, make a change, review it, and run the local push gates. Run commands from the repository root. You can stop between steps and return later.

On a fresh checkout, complete step 1 before using the `pnpm` menu or commands. Setup installs the pinned package manager.

Watch the [48s workflow walkthrough](video.md) for an overview.

## 1. Prepare the checkout

You need Node.js 22.18 or newer, Git, archive extraction tools, and network access. Start with the tracked Node entry point because the checkout's pinned package manager may not be installed yet. The first run downloads tools and dependencies and builds the package.

```sh
node scripts/repo/setup/bootstrap.mts
```

**Expected result:** setup prints “Setup complete.” Dependencies are in `node_modules/`, generated JavaScript is in `dist/`, and checkout tools stay under `.cache/`. Setup does not change global tools or shell settings.

**If interrupted:** rerun `node scripts/repo/setup/bootstrap.mts`. Valid downloads and dependencies are reused, and each phase checks its inputs before continuing.

After setup, use `pnpm` for repository commands. If your shell has no `pnpm`, use `.cache/bin/pnpm` in its place (`.cache/bin/pnpm.cmd` on Windows). You can also open the menu with `node scripts/repo/develop/run.mts` without changing PATH.

If setup fails, resolve the reported error. If it mentions a missing tool or wrong version, inspect readiness:

```sh
pnpm run setup:check
```

This reports Node.js and package-manager versions, whether pinned checkout tools are ready, and the suggested next command. It does not install or change tools.

Use `pnpm run setup:check -- --details` when you need executable paths or wrapper details. You do not need to edit PATH to use repository commands.

## Choose a task

| Task                   | Start here                                                                | While editing                               |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Use the library        | [Installation and examples](../../../README.md#install)                   | [API reference](../selector/api.md)         |
| Change engine behavior | Authored source in `src/` and its matching suite in `test/repo/`          | `pnpm run test:watch`                       |
| Improve documentation  | Maintained Markdown in `docs/repo/` or reusable guidance in `docs/fleet/` | `pnpm run guide`                            |
| Investigate a failure  | [Test setup and troubleshooting](../testing/upstream.md)                  | Run the failing command shown in the report |

The documentation command opens a local browser page and watches for file changes. Stop it with Ctrl+C when finished. Documentation and unit-test work do not require WPT or a browser download.

## 2. Edit and test as needed

Make the change in the matching source and test locations. A focused test is optional while editing. Pass its path to run only that suite:

```sh
pnpm run test:unit -- test/repo/unit/attribute-parse-error.test.mts
```

The focused command is useful for quick feedback. It does not check the full unit inventory or replace review.

To repeat unit tests while editing:

```sh
pnpm run test:watch
```

Stop watch mode with Ctrl+C. Your edited files stay on disk.

## 3. Review once

```sh
pnpm run review
```

This runs lint, formatting checks, type checks, and the full unit inventory in order. It stops at the first failure and does not fix files. Resolve the reported issue, then rerun only the failed step for diagnosis. Run review again after the fix.

Inspect the files you changed:

```sh
git diff
```

**Expected result:** the checks pass and the diff contains the intended changes. The additional checks below are conditional on the files or behavior changed.

## 4. Stage, commit, and run push gates

Stage the intended files and run the staged-file check before committing. The repository does not install a pre-commit hook, so run this check explicitly. It checks staged whitespace and supported staged files in a temporary snapshot. It preserves the index and working files, including partially staged files. Package and lint configuration changes run full lint. Formatting configuration changes run full formatting checks.

```sh
git add src/example.mts test/repo/unit/example.test.mts
pnpm run commit:check
git commit -m "Describe the change"
```

After the commit, preview and run the affected Node test plan against the pull request's target branch:

```sh
pnpm run test:ci --base origin/prerelease/3.0.0 --plan
pnpm run test:ci --base origin/prerelease/3.0.0
git push -u origin my-feature-branch
```

Replace `origin/prerelease/3.0.0` with the target ref and `my-feature-branch` with your branch name. The planner selects affected unit and integration suites. Run `pnpm run review` before staging. The plan and execution commands do not run that full review or push the branch. After the gates pass, push the branch and open or update its pull request.

## Additional checks

| Change area                     | Additional command      | Runs when needed for these changes      |
| ------------------------------- | ----------------------- | --------------------------------------- |
| Full repository validation      | `pnpm run check`        | You need the full check set             |
| Package exports or integration  | `pnpm run test:package` | Package or consumer behavior changes    |
| Browser behavior                | `pnpm run test:browser` | Browser-specific behavior changes       |
| Web Platform Tests              | `pnpm run test:wpt`     | Selector conformance changes            |
| Workflow or agent configuration | `pnpm run security`     | Workflow or agent configuration changes |
| All optional setup              | `pnpm run setup:full`   | You need every optional test tool       |

See [test commands](../testing/commands.md) and [performance work](../perf/benchmarks.md) for specialized tasks. Exact project and CI pins remain authoritative.

## Cleanup and recovery

`pnpm run clean` removes generated outputs. It keeps dependencies and tools, so the next build can reuse them. Preview with `pnpm run clean --dry-run`.

To reinstall dependencies, first preview the reset:

```sh
pnpm run reset:dependencies
```

When the listed paths match your intent, apply it:

```sh
pnpm run reset:dependencies --apply
```

Then run `pnpm run setup`. `pnpm run reset:tools` provides the same preview-and-apply flow for checkout tools. Neither reset removes other worktrees, shared browser caches, or the shared package store. A reset is optional and is not the first step for every error.

## Guided menu

After setup, run `pnpm run dev` to choose documentation, review, or setup help. Use 1–4 or the arrow keys to preview a task, then press Enter to run it. The menu returns after completed commands.

Use `pnpm run dev --plain` for numbered prompts, or `pnpm run dev --list` to
print the commands. A fresh checkout without installed dependencies can use
the text menu to run setup. The direct commands below remain available.

The docs server stays in the foreground while you edit. Ctrl+C stops it and
offers to return to the menu so you can choose Review. Ctrl+C during setup or
review stops that task and exits. Run `pnpm run dev` to open it again. Press q
or Esc in the visual menu to leave without running anything.

In plain mode, enter a number to preview the task, then press Enter to run it.
Use b to return to the choices or q to quit. Invalid input stays at the current
prompt. Setup help is optional and available whenever you need it. You can
return to any task without repeating the earlier steps.

Working through an agent? `pnpm --silent run dev --list --json` provides the
ordered choices for its interface. It can run one with
`pnpm --silent run dev --task setup:check --json`. See the
[agent harness contract](toolchain.md#agent-harnesses) for output and task
lifecycle details.
