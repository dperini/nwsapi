# Verified contributor tools

Bootstrap with `node scripts/repo/setup/tools.mts`, then prepend `.cache/bin` to `PATH`. `pnpm install --frozen-lockfile` prepares the verified Node, pnpm, npm, `nub`, `sfw`, browser, and default security tooling. The npm and pnpm stubs route installs through `sfw`.

`.config/external-tools.json` records exact releases, platforms, URLs, and archive or binary integrity. GitHub binaries come directly from their release assets. Cached bytes are verified before activation. `nub` manages the pinned Node interoperability matrix in `.config/node-interop.json`.

```sh
pnpm run setup:security
pnpm run setup:security --all
pnpm run security
```

Default security setup installs `uv`, `zizmor`, `actionlint`, and Cisco Skill Scanner. `ecc-agentshield` is an exact catalog development dependency. The full setup additionally installs `cdxgen`, `opengrep`, `trivy`, `trufflehog`, and the locked SkillSpector environment. Skill Scanner uses a verified platform wheel and a seven-day dependency age floor. SkillSpector uses its full Git commit and committed `uv.lock`, with Python 3.12 for native dependency compatibility.

The security command checks inline workflows with `actionlint` and `zizmor`, repository agent configuration with AgentShield, and installed repository skills with Skill Scanner. AgentShield sees Git-selected configuration files, including untracked files that Git does not ignore. Local caches and unrelated checkouts are excluded. Medium and higher findings fail the check. Reports are written beneath `.cache/security/reports/`.

`@vitiate/core` supplies fuzzing as an npm development dependency pinned in the pnpm catalog. Its native `@vitiate/engine` packages have exact versions and integrity hashes in `pnpm-lock.yaml`. Standalone executables belong in `.config/external-tools.json`.

## Schemas and dependency pins

TypeBox source schemas live in `scripts/repo/schema/`. `ata-validator` generates dependency-free validators under `.config/generated/` alongside JSON schemas for external tools, release requests, and artifact receipts.

```sh
pnpm run gen:schemas
pnpm run check:schemas
pnpm run check
```

The check command detects generated-file drift and inconsistent tool, package-manager, catalog, and lockfile integrity pins. Direct development dependencies use exact pnpm catalog versions. Small command, validation, and release helpers are maintained locally without a dependency on `@socketsecurity/lib`.

## Agent browser favicon

```sh
pnpm run gen:agent-favicon --preview
pnpm run gen:agent-favicon --check
python3 -m http.server 8765 --bind 127.0.0.1 --directory .cache/favicon-preview
pnpm run browser:agent http://127.0.0.1:8765/
```

The SVG generator owns the yellow–orange–gold diamond, black Playwright masks, and bottom-aligned AI stripe. Facial cutouts and the gap between the masks expose the diamond's gradient. The preview includes 16px, 32px, and 48px sizes. The browser helper installs the icon on existing pages and later navigations in the pinned Chromium browser. `pnpm run check` verifies that the generated asset is current.
