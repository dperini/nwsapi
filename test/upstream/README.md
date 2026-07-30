# Upstream WPT selector tests

This suite runs real [web-platform-tests](https://github.com/web-platform-tests/wpt)
pages from the pinned checkout in `upstream/wpt` (WPT master @ `7aed663`)
inside Chromium, with this repo's `src/nwsapi.js` installed over the native
selector engine.

How it works: before any page script runs, a Playwright init script evaluates
`src/nwsapi.js` and calls `NW.Dom.install()`, which overrides
`querySelector`/`querySelectorAll`/`matches`/`closest` on `Document`,
`DocumentFragment`, `Element` and `HTMLElement` prototypes with the NW engine
(the same trick the legacy `test/wpt/wpt-helper.js` used). Init scripts run in
every frame, so iframes used by WPT pages are covered too. Results are read
back through testharness.js' `add_completion_callback`.

The list of WPT files that run lives in `manifest.mjs` (DOM-only tests; no
rendering, `getComputedStyle`, or testdriver automation — see the exclusion
notes in that file).

Alongside the WPT pages, `state-pseudos.spec.mjs` runs in the same
`upstream` project. It covers the Selectors 4 state pseudo-classes wired
into `src/nwsapi.js` — `:open`, `:modal`, `:fullscreen`,
`:picture-in-picture`, the time-dimensional `:current`/`:past`/`:future`,
and `:closed` error behavior (including `:is(:closed)` forgiveness) —
against the local fixture `fixtures/state-pseudos.html` using the same
init-script install mechanism, plus a nwsapi-free page for native Chromium
ground truth (HTML `:open` parity and XML-document behavior).

## Running

```sh
pnpm test:upstream                 # full suite (all files, all subtests)
```

The suite starts `scripts/serve.mjs` on port 8000 automatically (or reuses a
server that is already listening there).

## Filtering

`--grep` selects whole WPT files; two env vars narrow down to individual
subtests (only matching subtests are asserted and counted, the rest show up
as `skipped-by-filter` in the per-file summary):

```sh
# Substring match on subtest names:
WPT_FILTER='Attribute presence' pnpm test:upstream

# Or a /regex/ (with optional flags):
WPT_FILTER='/nth-(last-)?child/' pnpm test:upstream

# Section match, using the "// comment" groups from
# upstream/wpt/dom/nodes/selectors.js (substring, case-insensitive):
WPT_SECTION='Combinators' pnpm test:upstream
WPT_SECTION='substring begins-with' pnpm test:upstream

# Whole files:
pnpm test:upstream --grep 'querySelector-All'
```

Both env vars may be combined; a file where nothing matches is reported as
skipped. To list the available section names:

```sh
node test/upstream/sections.mjs
```

## expectations.json (known-fail baseline)

`expectations.json` maps `"<file>::<subtest name>"` to a reason string for
every subtest that is known to fail. During a run:

- a failing subtest that **is** in the file is only warned about
  (`expected-fail` in the summary);
- a failing subtest that is **not** in the file fails the Playwright test;
- a **passing** subtest that is still listed is warned about as
  `UNEXPECTED PASS` (without failing), so stale entries are visible —
  delete them, or regenerate the baseline.

A harness-level error (page-wide timeout/setup failure) can be baselined
under the key `"<file>::__harness__"`.

Regenerate the baseline after engine changes (must be a full, unfiltered
run; `playwright.config.mjs` forces a single worker whenever
`WPT_UPDATE_EXPECTATIONS` is set, so the per-file rewrites of
`expectations.json` cannot race):

```sh
WPT_UPDATE_EXPECTATIONS=1 pnpm exec playwright test --project=upstream
```

Existing reasons are preserved; new entries get `"baseline @ wpt 7aed663"`.

## Debugging by hand (portless)

`scripts/serve.mjs` serves `upstream/wpt` as the document root (so WPT's
root-absolute `/resources/...` paths work) and mounts the repo itself under
`/_repo/` (`/_repo/src/nwsapi.js`, legacy `/_repo/test/wpt/...`). It honors
the `PORT` env var, which is exactly what portless needs:

```sh
pnpm run serve        # portless assigns PORT and proxies the server
# then browse https://nwsapi.localhost/dom/nodes/ParentNode-querySelector-All.html
```

Or plainly:

```sh
node scripts/serve.mjs                  # http://localhost:8000/
PORT=9999 node scripts/serve.mjs        # any port you like
```

Note that pages opened by hand run the *native* engine — the NW override is
injected by the Playwright spec (`wpt.spec.mjs`). To flip a hand-loaded page
over to NW, paste `src/nwsapi.js` into the console and run
`NW.Dom.install(true)`, or use the legacy helper pages under `/_repo/test/wpt/`.

One caveat about those legacy pages: `test/wpt/index.html` predates the
pinned sparse checkout and some of its links target WPT paths that are not
part of it (for example `/css/css-nesting/...`,
`/css/selectors/invalidation/...` and `/css/selectors/parsing/...`).
Those links 404 under `scripts/serve.mjs`; either follow them on
[wpt.live](https://wpt.live/) instead, or widen the sparse checkout in
`scripts/git-partial-submodule.mjs` if you need them locally.
