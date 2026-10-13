# Onboarding validation

The onboarding job in `.github/workflows/ci.yml` checks two complete contributor
journeys per operating system. Each journey starts with the minimum-Node
bootstrap check, then exercises a package-manager entry path and the developer
workflow.

| Journey | Entry into the checkout | Developer workflow |
| --- | --- | --- |
| `pnpm` | The README's literal `pnpm i`. | Managed `pnpm` setup, wizard, diagnostics, documentation, and review. |
| `npm` | The README's literal `npm i`. | Preparation installs checkout tools, then managed `pnpm` handles setup and the developer workflow. |

`pnpm` is the canonical manager for v3. The npm journey checks the supported
alternative entry and its transition to that workflow. The v2 contributor
workflow uses npm and rejects pnpm installation.

## Steps in each journey

1. Start with Node 22.18 and no usable package manager. Run the README bootstrap
   command and verify the prepared checkout.
2. Start a separate clean checkout with the pinned contributor Node and the
   journey's entry manager. Run the README's literal install command. This
   separate environment ensures bootstrap cannot hide missing install behavior.
3. Discover developer tasks and check readiness. On Linux, drive the numbered
   setup wizard through a real PTY, preview the command, confirm it, and exit.
4. Run setup through the JSON harness and check readiness again. Setup uses
   managed pnpm, including when installation began with npm.
5. Start the documentation server, fetch its HTML and modules, stop it, and
   verify shutdown. Run the discovered review task.
6. Remove `dist/`, repeat setup, and verify the rebuilt package and exports.
   Check both Socket Firewall launchers and the final checkout state.

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

Logs, phase summaries, and failed review reports are uploaded together under
one artifact per operating system and entry manager. The job summary includes
both the bootstrap and developer-workflow results. Local logs remain under
`.cache/onboarding/`.

## CI coverage

Pull requests run the two Linux journeys. Pushes to `prerelease/3.0.0` run both
journeys on Linux, macOS, and Windows: six onboarding jobs. Scheduled and manual
runs use the same six-job matrix when available for the selected workflow ref.
Scheduled execution requires the workflow on the default branch.

The separate `summary` job combines the ordinary checks and unit-test
results and verifies the expected unit inventory. Each onboarding journey
reports its own result.
