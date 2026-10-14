# Verified contributor toolchain

Run the bootstrap from the checkout root with Node 22.18 or newer. It imports only Node built-ins and tracked `.mts` and JSON files, so it works before `node_modules` exists.

```sh
node scripts/repo/setup/bootstrap.mts
```

The direct Node entry point works before the pinned package manager is installed. After setup, use `node scripts/repo/develop/run.mts` for guided tasks or `.cache/bin/pnpm` for repository commands (`.cache/bin/pnpm.cmd` on Windows). `pnpm run setup` and `npm run setup` also select the manager pinned for this branch and install dependencies with its frozen lockfile. Add `--tools-only` to provision tools without installing dependencies. No shell configuration is required.

With contributor Node 26.11.0 and either npm 12.2.0 or pnpm 12.12.0 already available, `npm i` and `pnpm i` install dependencies and run preparation directly. Preparation provisions verified checkout tools, refreshes agent aliases, prepares the video source, and builds with the pinned Node runtime. It does not recursively install dependencies. Node 22.18 is the bootstrap minimum, not the supported runtime for a direct npm 12.2 installation.

V3 uses `pnpm` for the managed developer workflow. Starting with `npm i` uses
npm for that installation, then preparation provisions the checkout tools.
Setup and shared script-runner handoffs use managed pnpm. The [onboarding
journeys](onboarding.md) check both entry paths. V2 uses npm and rejects pnpm
installation.

Exact direct dependency versions and build-script approvals agree across both managers. The workspace catalog supplies the pins. `pnpm-lock.yaml` records the pnpm graph and `package-lock.json` records the native npm graph. The graphs may resolve transitive dependencies differently. Commit both lockfiles when updating dependencies.

The default setup installs checkout tools and dependencies and builds the package. Browser tests and WPT install their additional requirements when invoked. `pnpm run security` prepares its scanners. `pnpm run setup:full` explicitly prepares all these tools. The first run needs network access. Repeated runs reuse verified downloads.

VoiceOver assets and current-user settings are an opt-in setup step after core setup succeeds. On a TTY, the prompt defaults to Not now. Use `--voiceover` to opt in or `--no-voiceover` to skip. Noninteractive setup skips it unless explicitly requested. `--tools-only` does not offer the step.

The optional setup never starts VoiceOver or narration and never edits TCC databases. It installs local Guidepup assets under `.cache/guidepup`. Machine configuration runs only when local VoiceOver preferences are readable and present. It may enable AppleScript control, disable the welcome splash and Dictation auto-enable, and ask you to enable AppleScript control in VoiceOver Utility. If preferences or settings cannot be verified, setup reports that state and skips machine configuration. Installed assets and detected settings do not verify macOS privacy permissions or prove VoiceOver is operational. Use the developer menu's VoiceOver controls to start or stop it explicitly.

In `pnpm run dev`, choose **VoiceOver controls** to see the current state and confirm Start or Stop. `pnpm run voiceover` opens the same prompt. For a direct action, use `pnpm run voiceover:start` or `pnpm run voiceover:stop`. These actions do not run Guidepup configuration. The Stop command also works before dependency installation as `node scripts/repo/develop/voiceover.mts --stop`. Command-F5 is the macOS toggle if you need to stop narration outside the menu.

Unit tests mock screen-reader and operating-system actions. `pnpm run voiceover:status` provides read-only guidance. The separate `pnpm run voiceover:test -- --url <local-api-reader-url>` command requires explicit interactive confirmation before starting narration. See [the narration check](../testing/voiceover.md) for prerequisites, cancellation, and preference recovery.

Setup prints numbered phases and their elapsed times, and stores its last phase in `.cache/setup-progress.json`. Successful installation owns preparation. Bootstrap repairs missing build outputs without repeating a completed preparation step. The final summary names the managed pnpm workflow and a direct Node menu command. Rerun the same setup command after resolving a failure. Each phase checks its inputs again, so a stale progress record cannot skip required work.

Run `pnpm run setup:check` for a short readiness summary. Add `--details` for PATH resolution, inferred ownership, external version minimums, exact project pins, and checkout wrapper verification. It compares the generated Firewall launchers with the expected command and recursion guards. External wrappers, aliases, and shell functions are not inspected. A ready checkout fallback can coexist with an older external manager. The check does not change global defaults.

Doctor reports tools, dependency installation, and build outputs separately. Its exit status checks tools and dependencies. Use `pnpm run setup:check --task guide` or `--task review` to check a specific task. Review prepares its own build outputs. Dependency checks cover the selected manager's lockfile and installation metadata, catalog pins, and installed direct package versions. The pnpm path also checks workspace links. These checks do not audit every transitive dependency.

Run `node scripts/repo/setup/voiceover/run.mts` to retry optional assets and settings without rerunning core setup. Confirmation defaults to skip. `--yes` explicitly opts in without a terminal. Core readiness and an incomplete optional phase are reported separately, and an explicitly requested failure retains its nonzero status.

Normal setup and `prepare` also refresh local agent guidance from `.claude/skills/` and `AGENTS.md`. Run `pnpm run setup:agents` to refresh only those aliases, or add `--check` to inspect them without writing. See [shared agent guidance](agent-guidance.md) for discovery paths and the ignore policy.

The interactive menu remembers its last task and outcome in `.cache/developer-state.json` for up to 30 days. This is historical metadata, not a current validation result. Reopening the menu never starts a task. Delete that file to forget the history. Task output and environment variables are not saved.

External version minimums and project pins have different roles. Repository tasks run the pinned Node and package managers together. Meeting an external version minimum alone does not establish runtime compatibility or override a project pin.

To use the pinned tools directly, prepend `.cache/bin` to `PATH`. In PowerShell, use `$env:PATH = "$PWD\.cache\bin;$env:PATH"`. The prerelease workflows run the tools bootstrap with `--github-path`, which adds this checkout's tool directory to subsequent steps. CI uses the exact contributor Node version from `.config/external-tools.json`. The [workflow guide](workflows.md) describes the local checkout and artifact actions.

The manifest pins platform-specific GitHub release archives for `nub` and `pnpm` and standalone Socket Firewall Free (`sfw`) binaries, including distinct Linux glibc and musl assets. `npm` has one platform-independent registry archive with its pinned SHA-512 integrity. GitHub asset SHA-256 and SHA-512 pins come from the release API's digests or the shared Wheelhouse manifest. No registry wrapper or global package-manager installation is needed.

The installer rejects missing platform entries, invalid integrity strings, failed downloads, and mismatched bytes. It verifies a download before extraction and rechecks cached archives on every setup. It compares installed executables and sidecars with a fresh extraction of the verified archive, repairing altered installed files. A corrupt cached archive is discarded and downloaded again using the same pin. A replacement with mismatched bytes stops setup. Symlinks and other nonregular archive entries also stop setup instead of being replaced.

Setup also verifies the pinned `mise` release. It registers the verified `nub` installation with `mise link`, then runs the exact `nub` version through `mise exec` to provision the contributor Node version. Full setup also provisions the interoperability runtimes and Linux linker. The package consumer check provisions its interoperability runtimes when invoked. Use `pnpm run setup:node` when you need only those runtimes. `nub` verifies Node distribution checksums. All `mise` state stays under `.cache/mise/`, with an isolated configuration that does not read or change global tool selections or enable background updates. The harness checks the resolved executable's exact version and runs stock Node. The [package test guide](../testing/commands.md#test-the-testing-library-consumer-path) describes the interoperability cases.

Both `pnpm install` and `npm install` provision tools and build the package in `prepare`. `pnpm run setup:tools` verifies and provisions the checkout tools explicitly. Tools and launchers stay under this checkout's ignored `.cache/` directory. Setup does not edit shell configuration or install global shims.

The `npm` and `pnpm` launchers use Wheelhouse's Socket Firewall wrapper behavior. Each manager has its own recursion guard, preserves other launchers on `PATH`, and forwards arguments and exit status. The `pnpm` launcher checks its exact version before every invocation. Interactive commands keep their foreground terminal. Noninteractive wrappers clean up the firewall process group when they exit or receive a signal.

Setup installs `sfw` 1.15.4 with exact archive digests. Its Windows binary embeds Node 24.21.0, replacing the Node 24.9.0 runtime in `sfw` 1.15.2 that was [reported to crash during shutdown](https://github.com/SocketDev/sfw-free/issues/66). The free binary requires no Socket credentials. Its download and cached bytes pass the same integrity checks as the other tools. Missing or failed setup leaves helpful-error stubs that exit 127. Rerun `node scripts/repo/setup/tools.mts` to repair them. Explicit `SFW_CA_CERT_PATH` and `SFW_CA_KEY_PATH` settings are preserved. Otherwise, an existing readable CA pair under `~/.socket/sfw/` is reused. Setup does not create certificates or change the system trust store.

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
Use the numbered keys or arrow keys to preview a task, then Enter to run it. Ctrl+C
stops the docs server and offers to return to the menu. During other tasks,
Ctrl+C stops the task and exits. Reopen with `pnpm run dev`.

The visual menu shows task readiness beside each task and keeps the exact
command above the keyboard hints. Use Page Up and Page Down to read longer
details and historical results. Scrolling does not change the selected task.
Choosing a different task returns its details to the top.

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
arrays. `command` identifies the underlying package script or direct helper command. `execution`
invokes the shared runner with JSON results. The IDs are `setup`, `guide`,
`review`, `ci:local`, `setup:check`, and `voiceover`. Discovery never starts a
task. `--json` alone also selects discovery.

A harness can present these choices with its own question or selection UI,
then execute the selected task. Explicit `--task` works without a TTY and
does not load `@opentui/core` or wait for menu input. Child stdin is closed.
The selected command still needs its normal filesystem and network access. VoiceOver controls show the current state and require an explicit Start or Stop action.

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

The review unit step runs every shard serially and verifies the combined report
against the full unit test inventory. Each shard prints its start, elapsed time,
and report path. Every review run creates a fresh temporary report directory.
It does not load a previous result or reuse report envelopes. If a failure
report identifies a suite, the runner prints a focused `pnpm run test:unit --
<suite-path>` command. Otherwise it recommends `pnpm run test:unit` to rerun
the unit step directly. These focused runs are diagnostic and do not verify the
full inventory. Resolve the failure, then rerun `pnpm run review` to complete
the full review.

Discovery and plain mode use Node built-ins and local modules. The setup
implementation and native UI load only when needed. JSON output is written
once per invocation, and task logs stream directly without being buffered
in memory.

Use `node scripts/repo/develop/run.mts --version v2` or `--version v3` to select
the 2.x or 3.x product checkout. If the current checkout has the selected
version's guided runner, it runs there so local edits remain available.
Otherwise, the selector creates a uniquely named worktree under
`os.tmpdir()`, prints its path, and runs that checkout's runner with that
checkout as its working directory. A checkout without the version's runner
reports the available package command path instead of invoking another
version's scripts. `--version ... --list --json` only discovers tasks and does
not create a worktree.

Version worktrees keep a small source, target, hostname, and ownership record
beside the checkout. A live runner refreshes a host-tagged tokenized pulse.
Unknown or foreign hosts are retained without interpreting their PIDs. Clean shutdown records a
matching release token, then removes the pulse. A crash leaves its pulse and
the sweep retains that checkout for review. These records are local to the
temporary worktree and are not a central registry.

Use `node scripts/repo/develop/run.mts --sweep --json` to preview eligible
cleanup. Add `--apply` to remove eligible worktrees. The sweep only considers
helper-marked worktrees under the canonical system temporary directory. It
requires source commits beyond the recorded starting point and proves the
current source HEAD is an ancestor of the exact recorded local target branch.
It retains active or uncertain owners, locked or current worktrees, dirty,
untracked, ignored, or submodule content, missing targets, and unmerged or
ambiguous work. Squash and rebase integrations are retained because this
workflow has no separate integration proof for them. Source branches are never
deleted automatically.
