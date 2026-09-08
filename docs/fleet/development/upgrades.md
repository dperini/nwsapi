# Upgrade dependencies and fleet tooling

Dependency upgrades, payload restoration, and product releases have different effects. Choose the operation that matches the intended change.

## Update dependencies

Use `pnpm run update` from the repository root. The shared updater applies dependency-age policy, reconciles fleet pins and stable aliases, refreshes lockfiles, and runs the configured ecosystem updates. Read its help before running it because the command can affect more than JavaScript dependencies.

Keep manifest and lockfile changes together. Review changed versions, patches, and generated configuration. Preserve the [dependency-age policy](../agents.md/multi-ecosystem-soak.md) and [immutable references](../agents.md/immutable-references.md). Do not work around a failed install by dropping an integrity check or changing a tool pin without evidence.

A `-stable` alias gives tooling an independent installed implementation. Updating it must not redirect product tests away from the current source. Follow the [test quality guidance](../testing/quality.md).

## Restore or refresh the fleet payload

Use the tracked `scripts/repo/bootstrap/fleet.mjs` entry point. Some members expose it through `pnpm run sync-fleet`; check the package scripts first. Read the bootstrap's help for the supported source and refresh options.

Restoring the selected payload repairs missing shared files. Adopting a different payload version changes the tooling used by the member. Review that change separately from product dependency updates.

Edit shared files at their canonical Wheelhouse template source. Member-owned settings belong in `.config/repo/socket-wheelhouse.json`. Read-only files under fleet directories are installed outputs. Follow the [source ownership rule](../agents.md/fix-at-the-source-not-the-mirror.md).

## Verify the result

Run the affected build, test, lint, and configuration checks. Check the resolved tool versions and payload identity before declaring the upgrade complete. Preserve useful failure reports, and distinguish a completed local update from changes published to other members.

Publishing a new fleet payload is a Wheelhouse-maintainer operation. Its release and propagation procedures belong in Wheelhouse's `docs/repo/`. Updating a member does not authorize publishing or cascading changes to the rest of the fleet.
