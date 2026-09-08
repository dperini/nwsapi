# Wheelhouse settings

The member-owned Wheelhouse settings file is `.config/repo/socket-wheelhouse.json`. Claude's `.claude/settings.json` controls a different system. Use the Wheelhouse file for repository build, test, coverage, and workflow configuration.

The schema in `scripts/fleet/socket-wheelhouse-schema.mts` defines accepted settings. Its component schemas explain individual fields. Check the schema installed with the selected fleet payload before adding a setting. Copying a field from a newer checkout does not establish that the current runner supports it.

## Choose the owning section

| Section | Responsibility |
| --- | --- |
| `repoName` and `repo` | These identify the member and whether it is a single-package repository or a workspace. |
| `build` and `secondaries` | These describe the primary build and additional distribution channels. |
| `capabilities` | This declares the tooling and language capabilities the member needs. |
| `vitest`, `cover`, and `coverage` | These configure test execution and coverage. Read each schema because these sections have different roles. |
| `lint`, `scripts`, and `workspace` | These configure supported development-tool behavior. |
| `github`, `workflows`, and `release` | These configure hosted workflows and release behavior. |
| `ai`, `claude`, and `hooks` | These configure the supported agent and hook integration. |

Optional sections are not requirements to add empty configuration. Keep settings only when they describe a real member need. Put repository-only instructions beside the relevant implementation in `docs/repo/`.

## Validate changes

Use the existing schema check, `socket-wheelhouse-config-matches-schema`, through the repository's check runner. Inspect the resulting runner or workflow configuration to confirm that the setting has the intended effect. Valid JSON alone does not prove the setting is accepted or used.

Keep runtime configuration data in the member settings surface instead of creating another standalone JSON file. The [configuration ownership rules](../agents.md/config-segregation.md) explain the boundary between `.config/repo/` and generated `.config/fleet/` files.

Do not store secrets in the settings file. Configure credentials through the supported environment, keychain, or hosted workflow mechanism. Follow the [token rules](../agents.md/token-hygiene.md).
