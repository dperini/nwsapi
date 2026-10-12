# Cold onboarding validation

This workflow tests first-install behavior from a separate, clean clone of the exact source commit. Each scenario starts with empty user, XDG, package-manager, Corepack, `nub`, and `mise` state. The runner does not restore CI caches. Its logs stay under `.cache/onboarding/`.

## Evidence collected by each run

The runner checks that the clone starts without `node_modules/`, `dist/`, or `.cache/`. It records the entry Node and manager versions, runs the README's marked bootstrap or literal manager install, and then checks current harness readiness. It compares package manifests, both lockfiles, and isolated shell and global-config sentinels before and after installation. A build check requires each output listed by `.config/build.config.mts`, validates package exports, and loads the built engine.

The `journey` scenario uses the task list returned by `node scripts/repo/develop/run.mts --list --json`. It first confirms setup diagnostics fail before setup. On Linux it then drives the real numbered menu through a PTY: it previews setup, confirms only after the command is shown, verifies `node_modules/` and `.cache/` stay absent until confirmation, completes setup, and quits the menu. The discovered setup task then runs through the JSON harness, followed by passing diagnostics. The runner starts the discovered guide task, fetches its local HTML and module, verifies shutdown after SIGTERM, runs the discovered review task, then removes only `dist/` and repeats setup to confirm a rebuild. The guide check validates HTTP responses and module bodies; it does not render a browser page or run accessibility checks. The PTY menu check is explicitly marked skipped on macOS and Windows; those platforms do not run the Linux journey lane.

The runner uses direct OS prerequisites such as Git and archive extraction tools. External npm and pnpm manager executables are provisioned outside the checkout for their respective raw-install lanes. The package lifecycle remains responsible for installing checkout tools. No lane uses `--ignore-scripts`, blanket approval, forced peer resolution, or a retry after failure.

## Workflow coverage

Pull requests and pushes to `prerelease/3.0.0` run independent Linux lanes for Node bootstrap at the 22.18 minimum, literal `npm i`, literal `pnpm i`, and the full wizard journey. Native jobs run bootstrap and both manager lanes on macOS and Windows when pushed to this branch, and on scheduled or manual dispatches after the workflow reaches the default branch. The workflow has no restored package or tool cache.

## Recorded results

On October 12, 2026, [run 38289785970](https://github.com/dperini/nwsapi/actions/runs/38289785970) at `31b7357` passed Linux bootstrap, npm, pnpm, and the complete wizard journey. All three macOS installation lanes passed. The [ordinary CI gates](https://github.com/dperini/nwsapi/actions/runs/38289785952) passed at that revision too.

A fresh local macOS journey at `15cbe8b` completed setup, guide delivery and shutdown, review, removal and rebuilding of `dist/`, manifest and export checks, both Firewall launcher checks, and final readiness. The review verified 420 unit-test files and 2,541 tests across 32 shards, plus lint, formatting, and types. Its log is `.cache/onboarding/journey-2026-10-12T18-31-06.126Z.log`.

Cold runs exposed issues that focused checks did not: detached checkouts could return an empty task list, Windows command launchers resolved the wrong executable, and macOS filesystem aliases could make repeat setup exit without rebuilding. The branch now includes fixes and behavioral regression coverage. The launcher test runs on the host platform without skipping the unit inventory. Rejected review reports, including pending tests, are retained for diagnosis. Shared script drivers now schedule the full unit matrix and a separate integration run. Focused related tests are constrained to unit and integration tiers with their existing time budgets.

Windows onboarding has not passed. [Run 38290856045](https://github.com/dperini/nwsapi/actions/runs/38290856045) at `912d3fa` reached the pinned pnpm download and failed with `UND_ERR_SOCKET` for the GitHub release archive. The preceding nub download succeeded. The Windows npm and pnpm lanes completed installation but failed their subsequent readiness checks. The branch now uses the activated checkout Node path consistently when generating and verifying the Windows npm wrapper. Mocked Windows regressions pass, with native confirmation pending. The download diagnostic includes the asset location and error code while omitting URL credentials, query strings, and raw error messages.

Native npm installation also reported nine development dependency advisories in the pinned toolchain. Those findings require a separate dependency review.

The guide checks establish HTTP delivery and process shutdown. Browser rendering and assistive-technology behavior require their separate, opt-in checks. Linux PTY evidence does not establish native terminal behavior on macOS or Windows.
