# V2 contributor toolchain

V2 owns its package installation through npm. The `preinstall` guard rejects
other package managers. Use the pinned npm version selected by the setup tools
and keep `package-lock.json` as the dependency lockfile.

Start setup with Node.js 22.18 or newer:

```sh
node scripts/setup.mjs
```

The bootstrap verifies the tool archives and integrity hashes in
`.config/external-tools.json`, provisions the pinned Node.js through `mise` and
`nub`, and installs dependencies with the pinned npm and `npm ci`. It then
checks the contributor runtime and completes core setup. PHP, Web Platform
Tests, and Chromium are prepared only by `node scripts/setup.mjs --full`. The
first run needs network access. With Node 26.11.0 and npm 12.2.0 or newer,
`npm i` also runs core preparation. Direct bootstrap is the recovery path for
missing or outdated package managers. Do not install a package named
`preinstall`. Use `node scripts/setup.mjs --tools-only` to provision
tools without installing dependencies or preparing the test fixtures.

After setup, use `node scripts/develop/run.mts` for guided tasks and
`.cache/bin/npm` for package scripts on macOS and Linux. On Windows, use
`.cache\bin\npm.cmd`. No global npm installation or PATH edit is required.

The developer menu uses the pinned `@opentui/core` 0.5.17 dependency. Its visual
mode needs Node.js 26.4 or newer and experimental FFI. After setup, the menu
uses the checkout's pinned Node.js when the current runtime is older. Before
setup, older Node.js versions, small terminals, and unsupported terminals use
numbered text prompts. The menu never changes global Node.js, npm, or shell
configuration.

The interactive menu remembers its last task and outcome in
`.cache/developer-state.json` for up to 30 days. This is historical metadata,
not a current validation result. Reopening the menu never starts a task.
Delete that file to forget the history. Task output and environment variables
are not saved.

`.cache/bin/npm run review` runs only the integration, fastpath, and release tests selected
by `npm test`. It does not run Web Platform Tests, change files, or publish.
For selector or browser behavior changes, run `.cache/bin/npm run setup:full` and then
`.cache/bin/npm run wpt:test`. V2 does not define formatter or type-check scripts.

Setup reports numbered phases and records its current phase in
`.cache/setup-progress.json`. Rerunning setup validates its inputs again.
Saved progress never skips work or proves current readiness.

Run `node scripts/develop/doctor.mts` to inspect setup readiness. It reports the active
`node` and `npm` found on `PATH`, the pinned checkout tool versions, and whether
direct dependencies match `package-lock.json`. `-- --details` adds executable
paths, resolved targets, and PATH positions. Tool ownership is inferred from
the executable path and may be unavailable. The check does not inspect shell
aliases or functions, audit transitive dependency contents, or change files.
If setup fails, use the suggested recovery command. Rerun with details when you
need to identify which executable was selected.

The menu's machine interface can be used before dependencies are installed:

```sh
node scripts/develop/run.mts --list --json
node scripts/develop/run.mts --task setup:check --json
```

The direct Node entry point avoids npm banners. JSON task execution keeps its
single result object on stdout and sends task output to stderr. Persistent
background sessions are not needed by v2's guided tasks.

## Onboarding verification

The separate `ci: onboarding` workflow is defined in
`.github/workflows/onboarding-v2.yml`. It runs only for direct setup, menu,
installer, pin, manifest, lockfile, or onboarding changes. README changes run a
small planner first. Only edits inside the balanced `<!-- <onboarding> -->`
section select the complete journey. Missing or malformed markers require
validation. Manual dispatch always runs the journey.

Bootstrap starts at Node 22.18 with no prepared checkout tools. The npm journey
starts at the contributor runtime with the pinned entry npm. Both use an
independent Git clone of the exact commit, an isolated home, and no installed
dependencies or tool cache. The bootstrap scenario checks the README bootstrap,
discovery, readiness, and selected pins without running the full menu journey.
The journey scenario follows marked README commands and runs setup,
documentation, review, and the terminal menu. Both verify that manifests and
pins remain unchanged. Linux journeys also
exercise the plain terminal menu, including preview and separate confirmation.
macOS and Windows exercise the JSON task interface. Their interactive PTY paths
remain unverified. Browser fixtures and publication are excluded.

Run `.cache/bin/npm run test:onboarding` locally for the npm entry path or
`node scripts/test/onboarding/run.mts bootstrap` for minimum-entry setup.
Commit first: the independent clone tests committed bytes. Logs and summaries
stay under `.cache/onboarding/`. Each phase records its elapsed time, and the
summary identifies the selected Node and npm pins. CI uploads the evidence even
when the run succeeds. These live
journeys use the network for actual installation and are separate from normal
unit tests. Follow remote runs in the background while continuing work.

Core setup provisions Node, npm, nub, and mise. The pnpm pin remains available
in the tool manifest, but v2 does not download or activate it during setup.
Required archive commands are checked before tool downloads or launcher
changes. A missing command is named with a direct bootstrap retry.
