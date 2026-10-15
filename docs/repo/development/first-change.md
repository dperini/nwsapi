# Make your first change

Use this path to create an isolated checkout, prepare it, edit a file, review
it, and push a branch. Run commands from the checkout root.

## 1. Create a branch and worktree

Create the worktree before setup, then change into it so setup and later commands
use that checkout. This example asks Node for a unique path under the operating
system's temporary directory. On macOS or Linux:

```sh
worktree=$(node --input-type=module -e 'import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; process.stdout.write(mkdtempSync(join(tmpdir(), "nwsapi-")))')
git worktree add -b my-feature-branch "$worktree/checkout" master
cd "$worktree/checkout"
```

On Windows, use PowerShell:

```powershell
$worktree = node --input-type=module -e 'import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; process.stdout.write(mkdtempSync(join(tmpdir(), "nwsapi-")))'
git worktree add -b my-feature-branch "$worktree/checkout" master
Set-Location "$worktree/checkout"
```

Replace `my-feature-branch` with your branch name. Keep each active branch in
its own worktree.

## 2. Prepare the checkout

With Node.js 26.11.0 and npm 12.2.0 or newer, install dependencies from the
checkout root:

```sh
npm i
```

Install prepares pinned tools, dependencies, and the package build. Tools stay
under `.cache/`; global tools and shell settings are unchanged. Rerun `npm i`
after an interrupted install.

If npm is unavailable or too old, bootstrap with Node.js 22.18 or newer:

```sh
node scripts/setup.mjs
```

This installs pinned npm and locked dependencies. Use
`node scripts/setup.mjs --full` only when you need PHP, Web Platform Tests, and
Chromium. Downloads are reused on retry. If npm still cannot run, open the menu
with `node scripts/develop/run.mts`.

## 3. Choose a task

Run `npm run dev` for the guided menu. It offers setup,
documentation, review, and setup diagnostics. Use 1–4 or the arrow keys to
preview a task, then press Enter to run it. Use `npm run dev -- --plain` for
numbered prompts. You can leave the menu and return between tasks.

| Task                   | Start here                                                   | While editing                             |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Use the library        | [Installation and examples](../../../README.md#installation) | [API reference](../../../README.md#api)   |
| Change engine behavior | Authored JavaScript in `src/` and its matching tests         | Run one test file with Node's test runner |
| Improve documentation  | Maintained Markdown in `docs/repo/`                          | Inspect the rendered page or diff         |
| Investigate a failure  | [Development setup](../../../README.md#development-setup)    | Follow the recovery command in the report |

V2 has no local documentation server. Read and edit the Markdown files in your
editor.

## 4. Edit and run optional focused tests

Make the change and inspect it with `git diff`. While editing, you can run one
test file directly with Node's test runner:

```sh
node --test test/repo/integration/develop.test.mjs
```

Replace the path with the test file that covers your change. This command runs
only that file. It is optional and does not replace the full review.

## 5. Review once

```sh
.cache/bin/npm run review
```

Review runs `npm test`, which covers the integration, fastpath, and release
suites. It stops when the test command fails. V2 does not include formatting or
type-check commands in this review. It does not run Web Platform Tests, change
files, or publish. It prints when `npm test` starts and its elapsed time and
exit result. Fix a failure, then run review again.

## 6. Run additional checks when needed

| Change area                  | Additional command                                                 | Run when                                      |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| JavaScript source            | `.cache/bin/npm run lint`                                          | Source changes need the repository lint check |
| Selector or browser behavior | `.cache/bin/npm run setup:full` then `.cache/bin/npm run wpt:test` | The change affects browser conformance        |
| Package publishing           | [Release guide](../../releases.md)                                 | You are preparing a v2 release                |

WPT setup may download the upstream checkout and browser on first use. The
guided review does not run these longer checks automatically.

## 7. Commit and push

Inspect the staged diff before committing:

```sh
git add <files-to-commit>
git status --short
git diff --cached
git commit -m "fix: describe the change"
git push -u origin my-feature-branch
```

Replace `my-feature-branch` with your branch name. V2 has no local affected-test
planner, so run `.cache/bin/npm run review` once before committing and let the pull request
checks run after the push. Open or update the pull request after the push.

## Menu and harness commands

For machine discovery, use the direct Node entry point and capture stdout
separately:

```sh
node scripts/develop/run.mts --list --json
node scripts/develop/run.mts --task setup:check --json
```

The JSON discovery output lists ordered task IDs and execution commands. A
harness can run one task with `--task <id> --json`. Task progress goes to
stderr, and stdout contains one final JSON result. The `docs` task only prints
the guide path. The `review` task stops at the first failed check.
