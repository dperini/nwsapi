# Make your first change

Use this path to prepare a checkout, make a change, and review it. Run commands from the repository root. You can stop between steps and return later.

Watch the [48s workflow walkthrough](video.md) for an overview.

## 1. Prepare the checkout

From the checkout root, install dependencies and prepare the checkout:

```sh
pnpm i
```

The install prepares pinned tools and builds the package. Tools stay in `.cache/`; global tools and shell settings are unchanged. You do not need to run setup again after a successful install.

If installation is interrupted, rerun `pnpm i`. Verified tool downloads are reused, and the package manager checks dependency state. If setup needs repair after installation, run `pnpm go`.

Next, run `pnpm run dev`. Choose **Open documentation**, **Review my changes**, or setup diagnostics.

If setup fails, resolve the reported error. If it mentions a missing tool or wrong version, check readiness from the contributor menu or run:

```sh
pnpm run setup:check
```

This reports Node.js and package-manager versions, whether pinned checkout tools are ready, and the suggested next command. It does not install or change tools.

Use `pnpm run setup:check -- --details` when you need executable paths or wrapper details. You do not need to edit PATH to use repository commands. If pnpm is unavailable, see [verified contributor toolchain](toolchain.md) for the direct Node bootstrap, which supports Node.js 22.18 or newer.

<details>
<summary>Use npm instead</summary>

With Node.js 26.11.0 and npm 12.2.0, install and open the same contributor menu with:

```sh
npm i
npm run dev
```

If setup needs repair, use `npm run go` with this entry path.

</details>

## Choose a task

| Task                   | Start here                                                                | While editing                               |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Use the library        | [Installation and examples](../../../README.md#install)                   | [API reference](../selector/api.md)         |
| Change engine behavior | Authored source in `src/` and its matching suite in `test/repo/`          | `pnpm run test:watch`                       |
| Improve documentation  | Maintained Markdown in `docs/repo/` or reusable guidance in `docs/fleet/` | `pnpm run guide`                            |
| Investigate a failure  | [Test setup and troubleshooting](../testing/upstream.md)                  | Run the failing command shown in the report |

The documentation command opens a local browser page and watches for file changes. Set `NWSAPI_GUIDE_NO_OPEN=1` to run the server without opening a browser, such as from an automated terminal session. Stop it with Ctrl+C when finished. Documentation and unit-test work do not require WPT or a browser download.

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

## 4. Commit and push

```sh
git add src/example.mts test/repo/unit/example.test.mts
git commit -m "fix: describe your change"
git push -u origin my-feature-branch
```

Setup installs staged checks before commit and affected Node tests before push. Custom hooks remain under their existing owner.

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

Then run `pnpm go`. `pnpm run reset:tools` provides the same preview-and-apply flow for checkout tools. Neither reset removes other worktrees, shared browser caches, or the shared package store. A reset is optional and is not the first step for every error.

The menu's keyboard controls, plain mode, and cancellation behavior are in the
[toolchain guide](toolchain.md#developer-menu).

<details>
<summary>Automate contributor tasks</summary>

`pnpm --silent run dev --list --json` provides the
ordered choices for its interface. It can run one with
`pnpm --silent run dev --task setup:check --json`. See the
[agent harness contract](toolchain.md#agent-harnesses) for output and task
lifecycle details.

</details>
