# Run repository checks and updates

Use the root commands for complete operations:

```sh
pnpm run check
pnpm run update --check
pnpm run update
```

`check` runs all discovered checks. `update --check` checks for available
updates without installing them. `update` applies updates and installs
dependencies under the existing version and soak policies.

## Add a subject command

Put a check in `scripts/repo/<subject>/check.mts`. Put an updater in
`scripts/repo/<subject>/update.mts`. Shared fleet subjects can use the same
layout under `scripts/fleet/`.

Add a package command with the subject first:

```json
{
  "scripts": {
    "example:check": "node scripts/repo/run.mts scripts/repo/example/check.mts",
    "example:update": "node scripts/repo/run.mts scripts/repo/example/update.mts"
  }
}
```

The root runners discover both the files and package commands ending in
`:check` or `:update`. A file with a package command runs once. A file without
a package command still runs. Package commands must point to an existing
subject entrypoint through `scripts/repo/run.mts`. Root compatibility
loaders are excluded to prevent recursion.

The runners are `scripts/repo/check/run.mts` and
`scripts/repo/update/run.mts`. The former root `.mts` paths remain loaders
for callers that already use them.

## Execution order and failures

Checks run in name order. Each child runs separately. A failed check does
not prevent the remaining checks from running. The root command reports
all failures and exits unsuccessfully when any check fails.

Updates run dependency updates first. Reference updaters follow. The native
WPT updater runs last so it sees the updated pins. A failed updater stops
the operation. The root forwards `--check` to every updater.

The dependency updater does not run reference updaters itself when used as
a command. The umbrella owns those steps, which prevents duplicate runs.

Old `check:foo` and `update:foo` package names remain compatibility aliases.
Use `foo:check` and `foo:update` in new commands and documentation.

## Generators are separate

The native-pool and native-scope commands need input files and create
output artifacts. Their canonical names are `wpt-native-pool:generate`
and `wpt-native-scope:generate`. They are not ordinary checks and are not
included in the root check. Their old command names remain aliases.

Checks validate existing files. They do not run the test suite. Updating
the native WPT reference can refresh browser evidence when pins change,
as the previous updater already did.

Pinned WPT analysis implementations stay at their recorded paths. Their
subject entrypoints delegate to those modules. This preserves the source
fingerprint of saved native results during the layout change.
