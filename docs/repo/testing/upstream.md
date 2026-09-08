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
The September 2026 audit expanded it from 41 to **73 upstream pages**, alongside **18 local regression pages**. It does not run the complete WPT project.

The audited run contains **5,418 subtests**: all pass, with zero expected failures and no filtered subtests. This covers the selected manifest, not the complete selector specification.

The latest expansion adds HTML form-state and directionality tests, plus a local static NodeList contract across document, element, fragment, and shadow contexts. It found and fixed document `designMode` editability and disabled-fieldset inheritance for options and optgroups.

The added pages also cover programmatic focus events, focus removal and hidden elements, top-layer focus behavior, disconnected language inheritance, and `moveBefore()` behavior for language, directionality, focus, modal dialogs, and popovers. The runner verifies replacement of all eight installed methods before each upstream page: `querySelector` and `querySelectorAll` on Document, Element, and DocumentFragment, plus Element `matches` and `closest`. Existing pages exercise these APIs, including scoped, XML, namespace, fragment, and ShadowRoot cases.

Each page attaches a `wpt-subtests` JSON report with counts and failure names. The manifest documents exclusions: CSSOM-only assertions, screenshot reftests, manual/crash tests without harness results, testdriver-dependent interaction, and aliases NWSAPI does not replace. These would need different harness support or would only measure the browser's own engine.

The expansion found and fixed disconnected language inheritance and focus-within behavior. Native directionality now supplies browser-computed state where available; the fallback honors explicit inherited directions after moves. Seven obsolete directionality expectations were removed after review. The remaining 313 expectations were resolved by fixes for heading selectors, namespace parsing, dynamic document roots and scope, placeholder state, attribute case flags, pseudo-elements, missing arguments, and static NodeList-compatible installed query results. [expectations.json](../../../test/repo/e2e/upstream/expectations.json) is now empty.

The separate browser regression suite also rejects nested `:has()` and pseudo-elements within `:has()`. Invalid alternatives inside forgiving `:is()` and `:where()` lists are discarded individually, with Chromium agreement checks. Its two former expected failures now pass normally.

<details>
<summary>How setup works</summary>

The contributor `prepare` script fetches WPT, verifies the checkout, and installs Chromium.
Published package installs do not run this setup.

[.gitmodules](../../../.gitmodules) records the WPT revision, selected directories, and manifest hash.
The checkout is ignored by Git and managed through this metadata, rather than a gitlink. The helper clones with `--depth=1 --single-branch --filter=blob:none --no-checkout`, applies cone-mode sparse checkout, and fetches the pinned revision at depth one. Verification checks the pin, shallow history, single-branch fetch refspec, sparse paths, and clean working tree. The sparse paths include `html/semantics/selectors`; the rest of WPT stays outside the checkout.

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
