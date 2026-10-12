# Cold onboarding validation

The `ci: onboarding` matrix job in `.github/workflows/ci.yml` tests first-install behavior from a separate, clean clone of the exact source commit. Each scenario starts with empty user, XDG, package-manager, Corepack, `nub`, and `mise` state. The runner does not restore CI caches. Its logs stay under `.cache/onboarding/`.

## Evidence collected by each run

The runner checks that the clone starts without `node_modules/`, `dist/`, or `.cache/`. It records the entry Node and manager versions, runs the README's marked bootstrap or literal manager install, and then checks current harness readiness. It compares package manifests, both lockfiles, and isolated shell and global-config sentinels before and after installation. A build check requires each output listed by `.config/build.config.mts`, validates package exports, and loads the built engine.

The `journey` scenario uses the task list returned by `node scripts/repo/develop/run.mts --list --json`. It first confirms setup diagnostics fail before setup. On Linux it then drives the real numbered menu through a PTY: it previews setup, confirms only after the command is shown, verifies `node_modules/` and `.cache/` stay absent until confirmation, completes setup, and quits the menu. The discovered setup task then runs through the JSON harness, followed by passing diagnostics. The runner starts the discovered guide task, fetches its local HTML and module, verifies shutdown after SIGTERM, runs the discovered review task, then removes only `dist/` and repeats setup to confirm a rebuild. The guide check validates HTTP responses and module bodies; it does not render a browser page or run accessibility checks. The PTY menu check is explicitly marked skipped on macOS and Windows; those platforms do not run the Linux journey lane.

The runner uses direct OS prerequisites such as Git and archive extraction tools. External npm and pnpm manager executables are provisioned outside the checkout for their respective raw-install lanes. The package lifecycle remains responsible for installing checkout tools. No lane uses `--ignore-scripts`, blanket approval, forced peer resolution, or a rerun of a failed installation. Individual archive downloads may recover from a socket reset with at most three attempts and one shared 120s deadline. Each retry is logged, and the downloaded bytes must still match the exact pinned digest. HTTP errors, TLS errors, aborts, and integrity failures are not retried.

## Workflow coverage

Pull requests and pushes to `prerelease/3.0.0` run independent Linux lanes for Node bootstrap at the 22.18 minimum, literal `npm i`, literal `pnpm i`, and the full wizard journey. Native jobs run bootstrap and both manager lanes on macOS and Windows when pushed to this branch, and on scheduled or manual dispatches after the workflow reaches the default branch. The onboarding job has no restored package or tool cache. Scheduled and manual runs execute onboarding only. Push and pull-request runs also execute the ordinary CI gates.

## Recorded results

On October 12, 2026, [run 38289785970](https://github.com/dperini/nwsapi/actions/runs/38289785970) at `31b7357` passed Linux bootstrap, npm, pnpm, and the complete wizard journey. All three macOS installation lanes passed. The [ordinary CI gates](https://github.com/dperini/nwsapi/actions/runs/38289785952) passed at that revision too.

A fresh local macOS journey at `15cbe8b` completed setup, guide delivery and shutdown, review, removal and rebuilding of `dist/`, manifest and export checks, both Firewall launcher checks, and final readiness. The review verified 420 unit-test files and 2,541 tests across 32 shards, plus lint, formatting, and types. Its log is `.cache/onboarding/journey-2026-10-12T18-31-06.126Z.log`.

Cold runs exposed issues that focused checks did not: detached checkouts could return an empty task list, Windows command launchers resolved the wrong executable, and macOS filesystem aliases could make repeat setup exit without rebuilding. The branch now includes fixes and behavioral regression coverage. The launcher test runs on the host platform without skipping the unit inventory. Rejected review reports, including pending tests, are retained for diagnosis. Shared script drivers now schedule the full unit matrix and a separate integration run. Focused related tests are constrained to unit and integration tiers with their existing time budgets.

### Windows failure analysis

[Run 38304267575](https://github.com/dperini/nwsapi/actions/runs/38304267575) at `ed55e3c` passed Windows bootstrap and literal `npm i`, including both Firewall launcher smoke checks. The literal `pnpm i` lane completed installation but failed readiness. All Linux and macOS lanes passed, including the complete Linux wizard journey.

The investigation separated four failures:

- Archive requests sometimes failed with `UND_ERR_SOCKET` or `ECONNRESET`. Fresh connections alone did not prevent resets. The exact remote cause remains unconfirmed. The downloader now logs bounded recovery for interrupted requests and bodies while retaining the original URL, timeout, and integrity pin.
- The Windows wrapper writer ended its last line with LF while the verifier expected CRLF. Both now use consistent CRLF, with a writer-to-verifier regression.
- The isolated Windows environment dropped `PATHEXT` and `ComSpec`, preventing direct bootstrap from resolving a managed executable. Both OS settings are now preserved.
- After successful installation, `sfw` 1.15.2 could crash during Windows shutdown with the [reported embedded-runtime assertion](https://github.com/SocketDev/sfw-free/issues/66). The exact pin is now 1.15.4, whose verified Windows binary embeds Node 24.21.0. Both Windows bootstrap and npm launcher smoke checks passed with that pin.

A further readiness failure was confirmed by [run 38305202692](https://github.com/dperini/nwsapi/actions/runs/38305202692): the pnpm lifecycle wrote long Windows paths while the doctor expected the short `RUNNER~1` spelling. Both wrapper comparisons reported `path-alias-equivalent=true` with matching CRLF counts. The managed tool cache and bin paths now derive from the native canonical repository path on Windows. Verification still compares complete wrapper contents exactly and rejects edited commands or guards. Native confirmation passed in [run 38305811370](https://github.com/dperini/nwsapi/actions/runs/38305811370) at `f04e500`: all ten cold onboarding lanes passed, including Windows bootstrap, literal `npm i`, and literal `pnpm i`. The Linux wizard review verified all 422 unit-test files and 2,563 tests across 32 shards. The [ordinary CI gates](https://github.com/dperini/nwsapi/actions/runs/38305811353) and [performance workflow](https://github.com/dperini/nwsapi/actions/runs/38305811415) passed at that revision. Local full-review attempts exceeded unit-shard time budgets, so the complete passing review evidence comes from CI.

Download diagnostics omit URL credentials, query strings, and raw error messages. Wrapper mismatch diagnostics report positions, lengths, newline counts, and alias equivalence without printing launcher contents.

Native npm installation also reported nine development dependency advisories in the pinned toolchain. Those findings require a separate dependency review.

The guide checks establish HTTP delivery and process shutdown. Browser rendering and assistive-technology behavior require their separate, opt-in checks. Linux PTY evidence does not establish native terminal behavior on macOS or Windows.
