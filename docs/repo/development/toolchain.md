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
prepares release tooling, PHP, Web Platform Tests, and Chromium. The first run
needs network access. Use `node scripts/setup.mjs --tools-only` to provision
tools without installing dependencies or preparing the test fixtures.

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

`npm run review` runs only the integration, fastpath, and release tests selected
by `npm test`. It does not run Web Platform Tests, change files, or publish.
For selector or browser behavior changes, run `npm run wpt:setup` and then
`npm run wpt:test`. V2 does not define formatter or type-check scripts.

Run `npm run setup:check` to inspect setup readiness. It reports the active
`node` and `npm` found on `PATH`, the pinned checkout tool versions, and whether
direct dependencies match `package-lock.json`. `-- --details` adds executable
paths, resolved targets, and PATH positions. Tool ownership is inferred from
the executable path and may be unavailable. The check does not inspect shell
aliases or functions, audit transitive dependency contents, or change files.
If setup fails, use the suggested recovery command. Rerun with details when you
need to identify which executable was selected.

The menu's machine interface can be used before dependencies are installed:

```sh
npm --silent run dev -- --list --json
node scripts/develop/run.mts --task setup:check --json
```

The direct Node entry point avoids npm banners. JSON task execution keeps its
single result object on stdout and sends task output to stderr. Persistent
background sessions are not needed by v2's guided tasks.
