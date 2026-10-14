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

You need Node.js 22.18 or newer, Git, archive extraction tools, and network
access. The direct Node entry point can install pinned npm before npm is
available:

```sh
node scripts/setup.mjs
```

Setup verifies pinned tools and installs locked dependencies. Use
`node scripts/setup.mjs --full` when you need PHP, Web Platform Tests, and Chromium. The first run needs network access.
Tools and isolated `mise` state stay under the checkout's ignored `.cache/`
directory. Setup does not change global tools or shell configuration.

If setup is interrupted, rerun `node scripts/setup.mjs`. Verified tool downloads are reused. Setup reinstalls the locked dependencies
and prepares this checkout. If setup reports a failure, follow its recovery
command. `node scripts/develop/doctor.mts` reports readiness without installing
or changing files. Add `--details` to inspect selected tool paths.

After setup, use `node scripts/develop/run.mts` for guided tasks. When a package
script is needed, use the pinned wrapper `.cache/bin/npm` on macOS and Linux or
`.cache\bin\npm.cmd` on Windows. These direct paths need no global npm or PATH
edit.
Examples below use the macOS and Linux spelling. Use the Windows wrapper path
for those package commands on Windows.

## 3. Choose a task

Run `node scripts/develop/run.mts` for the guided menu. It offers setup,
documentation, review, and setup diagnostics. Use 1–4 or the arrow keys to
preview a task, then press Enter to run it. Use `node scripts/develop/run.mts --plain` for
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
