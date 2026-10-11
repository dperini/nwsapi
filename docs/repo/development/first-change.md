# Make your first change

Use this path to prepare a checkout, edit a file, and review the result. Run commands from the repository root. You can stop between steps and return to the same step later.

Watch the [48s workflow walkthrough](video.md) for an overview.

## Guided menu

Run `pnpm run dev` to choose tasks by name. Use 1–4 or the arrow keys to highlight a
task and read its description and command. Press Enter to run it. The menu
orders tasks as setup, documentation, review, and optional setup help. It
returns after completed commands and keeps the last result visible.

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

## 1. Prepare the checkout

You need Node.js 22.18 or newer, Git, archive extraction tools, and network access. The first run downloads the pinned tools and project dependencies. Download time depends on your connection. Setup prints its current phase.

```sh
pnpm run setup
```

**Expected result:** setup finishes with “Setup complete” and a suggested next command. Dependencies are in `node_modules/` and generated JavaScript is in `dist/`. Checkout tools stay under `.cache/`. Your global tools and shell settings remain in place.

**If interrupted:** rerun the same command. Valid downloaded tools and dependencies are reused. Each phase checks its inputs before continuing.

**If setup fails:** resolve the error printed above the recovery message. If the error mentions a missing tool or a wrong version, check the setup tools:

```sh
pnpm run setup:check
```

This reports Node.js and package-manager versions, whether the pinned checkout tools are ready, and the suggested next command. It does not install or change tools. `doctor:tools` remains an alias.

Use `pnpm run setup:check --details` when you need executable paths or wrapper details. You do not need to edit PATH to use repository commands.

## 2. Choose a task

| Task                   | Start here                                                                | While editing                               |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Use the library        | [Installation and examples](../../../README.md#install)                   | [API reference](../selector/api.md)         |
| Change engine behavior | Authored source in `src/` and its matching suite in `test/repo/`          | `pnpm run test:watch`                       |
| Improve documentation  | Maintained Markdown in `docs/repo/` or reusable guidance in `docs/fleet/` | `pnpm run guide`                            |
| Investigate a failure  | [Test setup and troubleshooting](../testing/upstream.md)                  | Run the failing command shown in the report |

The documentation command opens a local browser page and watches for file changes. Stop it with Ctrl+C when finished. Documentation and unit-test work do not require WPT or a browser download.

## 3. Run the unit tests

```sh
pnpm test
```

**Expected result:** a test summary with no failures and exit code 0. A failure names the suite and case to investigate. Keep that output while you edit.

To run one suite, add its path:

```sh
pnpm test test/repo/unit/attribute-parse-error.test.mts
```

To repeat tests during editing:

```sh
pnpm run test:watch
```

Stop watch mode with Ctrl+C. Your edited files stay on disk.

## 4. Review your change

```sh
pnpm run review
```

This runs lint, formatting checks, type checks, and unit tests in order. It stops at the first failing command. These checks do not automatically fix your files. Resolve the reported issue, then rerun the command.

Inspect the files you changed:

```sh
git diff
```

**Expected result:** the checks pass and the diff contains the intended changes. Before opening a pull request, choose any additional checks below that apply to your change.

After staging the files for a commit, run `pnpm run commit:check` for a quick
staged-file pass. It checks staged whitespace, then lints and formats supported
staged files in a temporary snapshot of the Git index. It does not change the
index or working files, including partially staged files. This repository does
not install a Git pre-commit hook, so run the command explicitly. The staged
check does not replace `pnpm run review` or CI.

Before pushing a pull request branch, run the full review. To preview the
affected Node test plan locally, preview it after committing so the planner
checks the committed tree. Run the same command without `--plan` to execute it:

```sh
pnpm run review
pnpm run test:ci --base origin/prerelease/3.0.0 --plan
pnpm run test:ci --base origin/prerelease/3.0.0
```

Replace `origin/prerelease/3.0.0` with the pull request's target ref. The test
planner applies its affected-test selection, including the applicable unit and
integration suites. Review plus the executed affected test plan form the local
push gate. These commands do not push the branch. Review any additional checks
required by the files changed.

## Additional checks

| Work changed                    | Command                 | Additional requirements                     |
| ------------------------------- | ----------------------- | ------------------------------------------- |
| Full repository validation      | `pnpm run check`        | Prepares WPT and Chrome before the checks   |
| Package exports or integration  | `pnpm run test:package` | Uses pinned interoperability runtimes       |
| Browser behavior                | `pnpm run test:browser` | Prepares pinned Chrome on first use         |
| Web Platform Tests              | `pnpm run test:wpt`     | Prepares WPT and Chrome on first use        |
| Workflow or agent configuration | `pnpm run security`     | Prepares security scanners on first use     |
| All optional setup              | `pnpm run setup:full`   | Downloads missing scanners, WPT, and Chrome |

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
