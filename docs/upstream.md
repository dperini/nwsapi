# Upstream selector tests

The WPT runner loads `src/nwsapi.js` before each test page and installs it
as the selector engine. It checks 41 pages listed in `test/upstream/manifest.mjs`.
This is a selected suite, not the complete web-platform-tests project.

Run with Node.js ≥ 22 and a jsdom-supported release: 22.22.2+, 24.15.0+, or 26+.

```sh
npm ci
npm run upstream:clone
npm run upstream:verify
npx playwright install chromium
npm run test:upstream
```

`.gitmodules` pins WPT to `7aed6630812b20e6eec2a2e40594f8dfda036e00`.
The helper fetches a shallow, sparse checkout and verifies its manifest hash.
The checkout is ignored, not a Git submodule. Do not edit its files.
Clone and sparse-restoration commands reject paths that resolve outside the
repository and refuse dirty existing checkouts before changing them.

Node tests run separately with `npm test`; they need neither WPT nor Chromium.
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
WPT_UPDATE_EXPECTATIONS=1 npm run test:upstream
```

Review the diff before committing. Do not use baseline updates to hide regressions.
Filtered updates are rejected; baseline writes use one worker.

Use `WPT_FILTER` for a subtest-name substring or `/regex/`, and `WPT_SECTION`
for a selector-section substring. List sections with
`node test/upstream/sections.mjs`.

## Lint baseline

The flat configuration checks source and new tooling. `eslint-suppressions.json`
records two existing source findings: undefined `isInstanceof` in `byClass`
and an unused assignment to `source`. They are not repaired by this tooling PR.
Remove each suppression when its engine correction lands.
