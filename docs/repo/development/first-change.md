# Make your first change

Use this path to prepare a checkout, edit a file, review it, and push a branch.
Run commands from the checkout root. On a fresh checkout, complete setup before
using the npm menu or scripts.

## 1. Prepare the checkout

You need Node.js 22.18 or newer, Git, archive extraction tools, and network
access. The direct Node entry point can install pinned npm before npm is
available:

```sh
node scripts/setup.mjs
```

Setup installs pinned tools and dependencies, then prepares the test fixtures,
including Web Platform Tests and Chromium. The first run needs network access.
Tools and isolated `mise` state stay under the checkout's ignored `.cache/`
directory. Setup does not change global tools or shell configuration.

If setup is interrupted, rerun `node scripts/setup.mjs`. Valid tool downloads
and dependencies are reused. If setup reports a failure, follow its recovery
command. `npm run setup:check` reports readiness without installing or changing
files. Add `-- --details` to inspect selected tool paths.

## 2. Choose a task

After setup, run `npm run dev` for the guided menu. It offers setup,
documentation, review, and setup diagnostics. Use 1–4 or the arrow keys to
preview a task, then press Enter to run it. Use `npm run dev -- --plain` for
numbered prompts. You can leave the menu and return between tasks.

If you do not already have a working branch, create one before editing:

```sh
git switch -c my-feature-branch
```

Replace `my-feature-branch` with your branch name.

| Task                   | Start here                                                   | While editing                             |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Use the library        | [Installation and examples](../../../README.md#installation) | [API reference](../../../README.md#api)   |
| Change engine behavior | Authored JavaScript in `src/` and its matching tests         | Run one test file with Node's test runner |
| Improve documentation  | Maintained Markdown in `docs/repo/`                          | Inspect the rendered page or diff         |
| Investigate a failure  | [Development setup](../../../README.md#development-setup)    | Follow the recovery command in the report |

V2 has no local documentation server. Read and edit the Markdown files in your
editor.

## 3. Edit and run optional focused tests

Make the change and inspect it with `git diff`. While editing, you can run one
test file directly with Node's test runner:

```sh
node --test test/repo/integration/develop.test.mjs
```

Replace the path with the test file that covers your change. This command runs
only that file. It is optional and does not replace the full review.

## 4. Review once

```sh
npm run review
```

Review runs `npm test`, which covers the integration, fastpath, and release
suites. It stops when the test command fails. V2 does not include formatting or
type-check commands in this review. It does not run Web Platform Tests, change
files, or publish. It prints when `npm test` starts and its elapsed time and
exit result. Fix a failure, then run review again.

## 5. Run additional checks when needed

| Change area                  | Additional command                          | Run when                                      |
| ---------------------------- | ------------------------------------------- | --------------------------------------------- |
| JavaScript source            | `npm run lint`                              | Source changes need the repository lint check |
| Selector or browser behavior | `npm run wpt:setup` then `npm run wpt:test` | The change affects browser conformance        |
| Package publishing           | [Release guide](../../releases.md)          | You are preparing a v2 release                |

WPT setup may download the upstream checkout and browser on first use. The
guided review does not run these longer checks automatically.

## 6. Commit and push

Inspect the staged diff before committing:

```sh
git add <files-to-commit>
git status --short
git diff --cached
git commit -m "Describe the change"
git push -u origin my-feature-branch
```

Replace `my-feature-branch` with your branch name. V2 has no local affected-test
planner, so run `npm run review` once before committing and let the pull request
checks run after the push. Open or update the pull request after the push.

## Menu and harness commands

For machine discovery, keep npm's output quiet and capture stdout separately:

```sh
npm --silent run dev -- --list --json
node scripts/develop/run.mts --task setup:check --json
```

The JSON discovery output lists ordered task IDs and execution commands. A
harness can run one task with `--task <id> --json`. Task progress goes to
stderr, and stdout contains one final JSON result. The `docs` task only prints
the guide path. The `review` task stops at the first failed check.
