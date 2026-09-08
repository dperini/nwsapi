# Upstream selector tests

See the [WPT runner layout](wpt-runner.md) for the local harness files.

Contributor installs set up Web Platform Tests (WPT) and Chromium.

```sh
pnpm install
pnpm run test:wpt
```

The first install needs Git and network access. Linux may also need browser system libraries:

```sh
pnpm exec playwright install --with-deps chromium
```

The runner uses the pages in [the test manifest](../../../test/repo/e2e/upstream/manifest.mts).
The September 2026 review selects **130 pages**. It does not run the complete WPT project.

| Test group                         | Pages | Subtests | Passed | Known failures |
| ---------------------------------- | ----: | -------: | -----: | -------------: |
| Upstream DOM matching              |    75 |    5,366 |  5,366 |              0 |
| Adapted upstream selector validity |    36 |    1,668 |  1,143 |            525 |
| Local regressions                  |    19 |       77 |     77 |              0 |
| Total                              |   130 |    7,111 |  6,586 |            525 |

These counts describe the selected manifest in Chromium 151.0.7922.34. A known failure remains a failed subtest. No subtests were filtered. The [generated summary](../../../assets/repo/bench/wpt-summary.json) records the source hash, WPT revision, page counts, and failing names. The separate [Chrome comparison](../selector/compatibility.md) checks behavior in milestone 153.

The matching pages cover query results, form states, directionality, focus, dialogs, popovers, and tree changes. Local regressions cover API contracts and compiler behavior, including filtered child positions and sibling types across XML namespaces. Some fixtures reuse the DOM from upstream rendering tests, but assert query results instead of pixels or computed styles.

The parsing pages cover selector grammar across attributes, combinators, logical selectors, child positions, custom states, shadow selectors, highlights, scroll buttons, and view-transition pseudo-elements. The harness replaces the upstream selector helpers with validity checks through eight installed methods: `querySelector` and `querySelectorAll` on Document, Element, and DocumentFragment, plus Element `matches` and `closest`. Empty element and fragment contexts help catch validation that incorrectly depends on finding candidates.

These adaptations retain upstream selector inputs and acceptance expectations. They exclude CSSOM serialization and rendering assertions. The `An+B` page has embedded helpers, so an AST-based adapter redirects those helpers. A mixed part page contributes only its 23 direct selector helper calls. Both adapters reject unexpected upstream changes for review. Tentative WPT cases remain useful grammar probes and do not establish stable browser support.

Each page attaches a `wpt-subtests` JSON report with its origin, adaptation, counts, and failures. The runner verifies that `nwsapi` replaced all eight methods before upstream tests run. The manifest excludes screenshots, computed-style assertions, manual and crash tests without harness results, testdriver-dependent interaction, and aliases the engine does not replace.

The 525 known failures all come from newly surfaced parsing inputs. Their reasons are recorded in [expectations.json](../../../test/repo/e2e/upstream/expectations.json). They include missing valid syntax and invalid pseudo-element continuations that are accepted. See the [compatibility review](../selector/compatibility.md) for the implementation priorities.

To regenerate the tracked summary after a complete run:

```sh
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/nwsapi-wpt.json pnpm run test:wpt --reporter=dot,json
node scripts/repo/gen/wpt-summary.mts --input /tmp/nwsapi-wpt.json
pnpm exec oxfmt --config .config/oxfmt.json --write assets/repo/bench/wpt-summary.json
```

The generator rejects missing pages, inconsistent builds, filtered results, unexpected failures, and stale expectations that now pass. Full Playwright reports stay in a temporary directory. Commit the generated summary with the relevant test changes.

<details>
<summary>How setup works</summary>

The contributor `prepare` script fetches WPT, verifies the checkout, and installs Chromium.
Published package installs do not run this setup.

[.gitmodules](../../../.gitmodules) records the WPT revision, selected directories, and manifest hash.
The checkout is ignored by Git and managed through this metadata, rather than a gitlink. The helper clones with `--depth=1 --single-branch --filter=blob:none --no-checkout`, applies cone-mode sparse checkout, and fetches the pinned revision at depth one. Verification checks the pin, shallow history, single-branch fetch refspec, sparse paths, and clean working tree. The sparse paths include the selected selector, shadow, pseudo-element, overflow, view-transition, HTML, and DOM tests, plus their support files.

> [!IMPORTANT]
> Do not edit the upstream checkout. Setup refuses dirty checkouts and paths outside this repository.

If you install with `--ignore-scripts`, run setup separately:

```sh
pnpm run prepare
```

Use `pnpm run upstream:verify` to check the checkout without changing it.
The test server uses localhost port 8000 and refuses an occupied port.

</details>

<details>
<summary>Run other test groups</summary>

Run `pnpm test` for unit tests, or `pnpm run test:node` for unit and integration tests.
Those tests do not need Chromium or WPT. See [test budgets](commands.md) for the enforced timing limits.
Run `pnpm run test:browser` for browser regression tests.
Run `pnpm run cover` to measure coverage with WPT and Node tests.

To test the minified build:

```sh
NWSAPI_MINIFIED=1 pnpm run test:wpt
```

</details>

<details>
<summary>Review known failures</summary>

[expectations.json](../../../test/repo/e2e/upstream/expectations.json) records known failures.
Unexpected failures fail the run. Unexpected passes appear in the report for review.

> [!IMPORTANT]
> Do not update expectations to hide a regression. Review engine changes and test results first.

To update expectations after review:

```sh
WPT_UPDATE_EXPECTATIONS=1 pnpm run test:wpt
```

Review the diff before you commit it. Updates use one worker and cannot use test filters.

</details>

<details>
<summary>Filter test results</summary>

Set `WPT_FILTER` to a subtest name fragment or `/regex/`.
Set `WPT_SECTION` to a selector section name fragment.

List the sections with:

```sh
node test/repo/e2e/upstream/sections.mts
```

</details>
