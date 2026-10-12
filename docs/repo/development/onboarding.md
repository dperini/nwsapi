# Cold onboarding validation

This workflow tests first-install behavior from a separate, clean clone of the exact source commit. Each scenario starts with empty user, XDG, package-manager, Corepack, `nub`, and `mise` state. The runner does not restore CI caches. Its logs stay under `.cache/onboarding/`.

## Evidence collected by each run

The runner checks that the clone starts without `node_modules/`, `dist/`, or `.cache/`. It records the entry Node and manager versions, runs the README's marked bootstrap or literal manager install, and then checks current harness readiness. It compares package manifests, both lockfiles, and isolated shell and global-config sentinels before and after installation. A build check requires each output listed by `.config/build.config.mts`, validates package exports, and loads the built engine.

The `journey` scenario uses the task list returned by `node scripts/repo/develop/run.mts --list --json`. It first confirms setup diagnostics fail before setup. On Linux it then drives the real numbered menu through a PTY: it previews setup, confirms only after the command is shown, verifies `node_modules/` and `.cache/` stay absent until confirmation, completes setup, and quits the menu. The discovered setup task then runs through the JSON harness, followed by passing diagnostics. The runner starts the discovered guide task, fetches its local HTML and module, verifies shutdown after SIGTERM, runs the discovered review task, then removes only `dist/` and repeats setup to confirm a rebuild. The guide check validates HTTP responses and module bodies; it does not render a browser page or run accessibility checks. The PTY menu check is explicitly marked skipped on macOS and Windows; those platforms do not run the Linux journey lane.

The runner uses direct OS prerequisites such as Git and archive extraction tools. External npm and pnpm manager executables are provisioned outside the checkout for their respective raw-install lanes. The package lifecycle remains responsible for installing checkout tools. No lane uses `--ignore-scripts`, blanket approval, forced peer resolution, or a retry after failure.

## Workflow coverage

Pull requests and pushes to `prerelease/3.0.0` run independent Linux lanes for Node bootstrap at the 22.18 minimum, literal `npm i`, literal `pnpm i`, and the full wizard journey. Native jobs run bootstrap and both manager lanes on macOS and Windows when pushed to this branch, and on scheduled or manual dispatches after the workflow reaches the default branch. The workflow has no restored package or tool cache.

## Observed and unverified

The runner, scenario definitions, and CI workflow are present in this branch. Their code paths are covered by focused unit tests for environment isolation, README command parsing, and JSON envelope validation.

A local full cold run has not been recorded in this report. GitHub Linux, macOS, and Windows results remain unverified until the corresponding workflow lanes pass. Do not treat the presence of the workflow as evidence that a platform completed onboarding.
