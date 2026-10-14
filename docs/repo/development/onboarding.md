# Onboarding validation

The separate `.github/workflows/onboarding-v3.yml` workflow checks the minimum-Node
bootstrap once per operating system and two complete contributor journeys.
Bootstrap and manager journeys run in parallel in independent clean checkouts.
Ordinary checks and unit shards remain in `.github/workflows/ci.yml`.

| Journey | Entry into the checkout        | Developer workflow                                                                                 |
| ------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm`  | The README's literal `pnpm i`. | Managed `pnpm` setup, wizard, diagnostics, documentation, and review.                              |
| `npm`   | The README's literal `npm i`.  | Preparation installs checkout tools, then managed `pnpm` handles setup and the developer workflow. |

`pnpm` is the canonical manager for v3. The npm journey checks the supported
alternative entry and its transition to that workflow. The v2 contributor
workflow uses npm and rejects pnpm installation.

## Steps in each journey

1. Start with Node 22.18 and no usable package manager. Run the README bootstrap
   command and verify the prepared checkout.
2. Start a separate clean checkout with the pinned contributor Node and the
   journey's entry manager. Run the README's literal install command. This
   separate environment ensures bootstrap cannot hide missing install behavior.
3. On Linux, preview setup in a fresh checkout and quit before confirmation.
   Verify that tools and dependencies were not created. Then drive the numbered
   setup wizard through a real PTY, confirm it, and exit.
4. Remove build outputs, run the existing setup task through the JSON harness,
   and verify the rebuilt package and exports. This is also the npm-to-pnpm
   handoff and the recovery check, rather than another intact-checkout install.
5. Check readiness, start the documentation server, fetch its HTML and modules,
   stop it, and verify shutdown. Run the discovered review task.
6. Check both Socket Firewall launchers and the final checkout state.

The native terminal prompt check currently runs on Linux. macOS and Windows
run the JSON harness workflow and explicitly report the PTY check as skipped.
The documentation check verifies HTTP delivery and process shutdown. Browser
rendering and assistive-technology checks have their own opt-in commands.

## Isolation and diagnostics

Each checkout starts without `node_modules/`, `dist/`, or `.cache/`, with empty
user, XDG, package-manager, Corepack, `nub`, and `mise` state. Bootstrap and the
manager entry do not share those directories. CI does not restore onboarding
caches. The runner compares package manifests, both lockfiles, shell and global
configuration sentinels, and the Git revision before and after the journey.

The runner uses OS prerequisites such as Git and archive extraction tools.
Entry managers are provisioned outside the checkout at their manifest pins.
The package lifecycle remains responsible for installing checkout tools.
No journey skips lifecycle scripts, bypasses approval, forces peer resolution,
or reruns a failed installation. Archive downloads can recover from interrupted
connections with bounded retries and integrity verification.

Logs, phase summaries, and failed review reports are uploaded as separate
bootstrap and manager-journey artifacts per operating system. Each manager job
summarizes its developer-workflow result and phase durations. The npm entry is
labelled separately from the managed pnpm workflow. Local logs remain under
`.cache/onboarding/`.

## CI coverage

Pull requests run bootstrap and the two manager journeys on Linux. Pushes to
`prerelease/3.0.0` run them on Linux, macOS, and Windows: three bootstrap jobs
and six manager journeys. Manual dispatch runs the same matrix.

Automatic runs are limited to the onboarding workflow, onboarding runner,
setup scripts, developer helper, pinned manifests, lockfiles, workspace and
package-manager configuration, shared installer helpers, and
the README consumed by the runner. A small planning job compares the README's
`<!-- <onboarding> -->` and `<!-- </onboarding> -->` section. README edits outside
that block skip the full journeys. Missing, duplicate, or malformed markers
run validation rather than silently skipping it. Ordinary engine, test-suite, documentation,
and benchmark changes do not trigger onboarding.

Bootstrap is independent of the entry manager, so each operating system checks
it once. Running it in parallel removes its duration from the manager journey's
critical path. Both entry paths still use empty caches and run the complete
review. No dependencies or prepared checkout state are shared between jobs.

The separate `summary` job combines the ordinary checks and unit-test
results and verifies the expected unit inventory. Each onboarding journey
reports its own result.
