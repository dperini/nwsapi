# Upstream selector tests

The WPT runner loads `src/nwsapi.js` before each test page and installs it
as the selector engine. It checks 41 pages listed in `test/upstream/manifest.mts`.
This is a selected suite, not the complete web-platform-tests project.

Run with Node.js ≥ 22.

```sh
pnpm install --frozen-lockfile
pnpm run upstream:clone
pnpm run upstream:verify
pnpm exec playwright install chromium
pnpm run test:upstream
```

`.gitmodules` pins WPT to `7aed6630812b20e6eec2a2e40594f8dfda036e00`.
The helper fetches a shallow, sparse checkout and verifies its manifest hash.
The checkout is ignored, not a Git submodule. Do not edit its files.
Clone and sparse-restoration commands reject paths that resolve outside the
repository and refuse dirty existing checkouts before changing them.

Node tests run separately with `pnpm test`; they need neither WPT nor Chromium.
Set `NWSAPI_MINIFIED=1` to check the minified build with the same WPT baseline.
The browser server binds localhost and refuses an occupied port.

## Baseline

`test/upstream/expectations.json` records failures measured against unchanged
master `fe15bc3ae8f76725a13b329aad2efbe3fa75f9a4` using Chromium 151.0.7922.34.
It is not the earlier aggregate branch's baseline. Pending fixes keep their
regression assertions in their own PRs; a baseline entry does not replace them.

This baseline contains 352 expected failures, versus 336 in the aggregate.
The 16 additional failures cover relative `:has()` arguments and detached
elements. Their correction belongs to the relational-selector extraction.

Unexpected failures fail the run. Unexpected passes are reported for cleanup.
To regenerate after reviewing an engine or upstream change:

```sh
WPT_UPDATE_EXPECTATIONS=1 pnpm run test:upstream
```

Review the diff before committing. Do not use baseline updates to hide regressions.
Filtered updates are rejected; baseline writes use one worker.

Use `WPT_FILTER` for a subtest-name substring or `/regex/`, and `WPT_SECTION`
for a selector-section substring. List sections with
`node test/upstream/sections.mts`.

## Lint baseline

Oxlint checks source and tooling. The source rules retain the existing exceptions
for legacy code. Switching linters does not repair the existing undefined
`isInstanceof` in `byClass` or the unused assignment to `source`.
