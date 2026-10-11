# Verified contributor toolchain

Run the bootstrap from the checkout root with Node 22.18 or newer. It imports only Node built-ins and tracked `.mts` and JSON files, so it works before `node_modules` exists.

```sh
npm run setup
```

Either `npm run setup` or `pnpm run setup` selects the manager pinned for this branch and installs dependencies with its frozen lockfile. No shell configuration is required. `node scripts/repo/setup/bootstrap.mts` also works before a package manager is installed. Add `--tools-only` to provision tools without installing dependencies. Other scripts launched by a foreign package manager hand their entry point and arguments to the managed `pnpm` runtime.

The default setup installs checkout tools and dependencies and builds the package. Browser tests and WPT install their additional requirements when invoked. `npm run security` prepares its scanners. `npm run setup:full` explicitly prepares all these tools. The first run needs network access. Repeated runs reuse verified downloads.

Setup prints numbered phases and stores its last phase in `.cache/setup-progress.json`. Rerun the same setup command after resolving a failure. Each phase checks its inputs again, so a stale progress record cannot skip required work.

Run `npm run doctor:tools` for a short readiness summary. Add `-- --details` for PATH resolution, inferred ownership, external version minimums, exact project pins, and checkout wrapper verification. It compares the generated Firewall launchers with the expected command and recursion guards. External wrappers, aliases, and shell functions are not inspected. A ready checkout fallback can coexist with an older external manager. The doctor does not change global defaults.

External version minimums and project pins have different roles. Repository tasks run the pinned Node and package managers together. Meeting an external version minimum alone does not establish runtime compatibility or override a project pin.

To use the pinned tools directly, prepend `.cache/bin` to `PATH`. In PowerShell, use `$env:PATH = "$PWD\.cache\bin;$env:PATH"`. The prerelease workflows run the tools bootstrap with `--github-path`, which adds this checkout's tool directory to subsequent steps. CI uses the exact contributor Node version from `.config/external-tools.json`. The [workflow guide](workflows.md) describes the local checkout and artifact actions.

The manifest pins platform-specific GitHub release archives for `nub` and `pnpm` and standalone Socket Firewall Free (`sfw`) binaries, including distinct Linux glibc and musl assets. `npm` has one platform-independent registry archive with its pinned SHA-512 integrity. GitHub asset SHA-256 and SHA-512 pins come from the release API's digests or the shared Wheelhouse manifest. No registry wrapper or global package-manager installation is needed.

The installer rejects missing platform entries, invalid integrity strings, failed downloads, and mismatched bytes. It verifies a download before extraction and rechecks cached archives on every setup. It compares installed executables and sidecars with a fresh extraction of the verified archive, repairing altered installed files. A corrupt archive stops setup. Remove the affected file under `.cache/external-tools/archives/` and rerun setup to download it again.

Setup also verifies the pinned `mise` release. It registers the verified `nub` installation with `mise link`, then runs the exact `nub` version through `mise exec` to provision contributor and interoperability Node versions. `nub` verifies Node distribution checksums. All `mise` state stays under `.cache/mise/`, with an isolated configuration that does not read or change global tool selections or enable background updates. The harness checks the resolved executable's exact version and runs stock Node. The [package test guide](../testing/commands.md#test-the-testing-library-consumer-path) describes the interoperability cases.

`pnpm install` builds the package in `prepare`. `pnpm run setup:tools` verifies and provisions the checkout tools explicitly. Tools and launchers stay under this checkout's ignored `.cache/` directory. Setup does not edit shell configuration or install global shims.

The `npm` and `pnpm` launchers use Wheelhouse's Socket Firewall wrapper behavior. Each manager has its own recursion guard, preserves other launchers on `PATH`, and forwards arguments and exit status. The `pnpm` launcher checks its exact version before every invocation. Interactive commands keep their foreground terminal. Noninteractive wrappers clean up the firewall process group when they exit or receive a signal.

Setup installs `sfw` 1.15.2, the latest public release when this pin was updated. The free binary requires no Socket credentials. Its download and cached bytes pass the same integrity checks as the other tools. Missing or failed setup leaves helpful-error stubs that exit 127. Rerun `node scripts/repo/setup/tools.mts` to repair them. Explicit `SFW_CA_CERT_PATH` and `SFW_CA_KEY_PATH` settings are preserved. Otherwise, an existing readable CA pair under `~/.socket/sfw/` is reused. Setup does not create certificates or change the system trust store.

To update a tool, select its exact upstream release, record each supported asset and its independently obtained digest in `.config/external-tools.json`, and review the manifest diff. For GitHub releases, use the release API's `assets[].digest`. For `npm`, use the exact version's `dist.integrity`. The bootstrap never learns or rewrites the expected digest from the download it is about to execute. Update `.config/node-interop.json` when changing the tested Node matrix.

Validate a new pin with `node scripts/repo/setup/tools.mts`, `pnpm install --frozen-lockfile`, `pnpm run check`, and `pnpm run test:package`. Test the bootstrap in a disposable checkout without `node_modules` or a tool cache when changing installation code.

The [security tooling guide](contributor-tools.md) covers scanner setup, generated schemas, catalog validation, and the agent browser favicon. The [release guide](releases.md) covers staged npm publication and OIDC configuration.

## Developer menu

`pnpm run dev` opens a guided terminal menu built with `@opentui/core`. The
development dependency is pinned to 0.5.17 in the workspace catalog and
`pnpm-lock.yaml`, including its platform packages. This version satisfies the
repository's 24-hour release-age policy.

The native UI needs Node.js 26.4 or newer and experimental FFI. The launcher
enables FFI for its own process. It does not change global runtimes or shell
settings. Missing native support, missing dependencies, older Node versions,
and small terminals use numbered prompts. Shrinking the terminal below
80×24 also switches to numbered prompts. `--plain` selects that mode
explicitly. Noninteractive input prints the task list without running tasks.

Setup and diagnostics remain available before checkout tools are ready. Other
tasks use the pinned checkout package manager through its Firewall wrapper.
Each action runs from the repository root with inherited terminal output.
Finishing returns control to the menu after the user has read the output.
Use 1–4 or the arrow keys to preview a task, then Enter to run it. Ctrl+C
stops the docs server and offers to return to the menu. During other tasks,
Ctrl+C stops the task and exits. Reopen with `pnpm run dev`.

### Agent harnesses

Codex, Claude Code, and OpenCode can discover the same ordered tasks and run
one without terminal interaction. Run these commands from the repository root:

```sh
pnpm --silent run dev --list --json
pnpm --silent run dev --task setup:check --json
```

Before package managers or dependencies are installed, use
`node scripts/repo/develop/run.mts` with the same arguments. This direct Node
entry point also avoids package-manager banners when parsing stdout.

Discovery returns one JSON object with `schemaVersion: 1`, `type: "tasks"`,
and a `tasks` array in workflow order. Each task has a stable `id`, `order`,
`name`, `description`, `detail`, `next`, `persistent`, `optional`, and command argument
arrays. `command` identifies the underlying package script. `execution`
invokes the shared runner with JSON results. The IDs are `setup`, `guide`,
`review`, and `setup:check`. Discovery never starts a task. `--json` alone
also selects discovery.

A harness can present these choices with its own question or selection UI,
then execute the selected task. Explicit `--task` works without a TTY and
does not load `@opentui/core` or wait for menu input. Child stdin is closed.
The selected command still needs its normal filesystem and network access.

In JSON mode, stdout contains a single final object. Progress and child
stdout/stderr go to stderr. Capture the two streams separately. Results
include `schemaVersion`, `type: "result"`, `task`, `status`, `exitCode`,
`signal`, `message`, and `next`. Status is `completed`, `failed`, or `stopped`.
`next` is populated only after success. The runner exits with the task's
exit code, including nonzero failures. Launch errors return a failed result
with exit code 1. Invalid arguments return `type: "error"`, a message, and
exit code 1 without executing a task. `--help` prints human-readable usage.

The `guide` task is persistent. Run it in a managed background session and
retain the session handle to stop it when finished. Its final JSON result
arrives when the server exits, not when it becomes ready. SIGINT or SIGTERM
is forwarded to the child and returns a stopped result with exit code 130
or 143. On macOS and Linux, noninteractive execution isolates a process group
so cancellation also reaches child commands. A command that ignores shutdown
is killed after 5s. On Windows, signals stop the direct child without the same
process-group guarantee. A forced kill of the runner cannot produce a final
result. There is no automatic
task chaining, and selecting `review` explicitly runs its checks and tests.

Discovery and plain mode use Node built-ins and local modules. The setup
implementation and native UI load only when needed. JSON output is written
once per invocation, and task logs stream directly without being buffered
in memory.
