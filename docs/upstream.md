# Upstream selector tests

Contributor installs set up Web Platform Tests (WPT) and Chromium.

```sh
pnpm install
pnpm run test:upstream
```

The first install needs Git and network access. Linux may also need browser system libraries:

```sh
pnpm exec playwright install --with-deps chromium
```

The runner uses the pages in [the test manifest](../test/repo/e2e/upstream/manifest.mts), including a local regression page.
It does not run the complete WPT project. Known failures remain visible in the report.

<details>
<summary>How setup works</summary>

The contributor `prepare` script fetches WPT, verifies the checkout, and installs Chromium.
Published package installs do not run this setup.

[.gitmodules](../.gitmodules) records the WPT revision, selected directories, and manifest hash.
The checkout is ignored by Git. It is not a Git submodule.

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

Run `pnpm test` for Node tests. Those tests do not need Chromium or WPT.
Run `pnpm run test:browser` for browser regression tests.
Run `pnpm run test:coverage` to measure coverage with WPT and Node tests.
The report combines hits from both runners for each engine source file.
Node tests also cover the jsdom adapter. Coverage thresholds apply to the combined report.
The coverage command also runs the browser regression tests.

To test the minified build:

```sh
NWSAPI_MINIFIED=1 pnpm run test:upstream
```

</details>

<details>
<summary>Review known failures</summary>

[expectations.json](../test/repo/e2e/upstream/expectations.json) records known failures.
Unexpected failures and unexpected passes fail the run.
Remove passing cases from the baseline after reviewing the results.

Browser tests are gated by `NWSAPI_BROWSER` only in the Node-only suite.
Both `test:browser` and `test:coverage` enable them. They are not disabled in CI.

Two local expected failures still check invalid `:has()` arguments: nested
`:has()` is accepted, and pseudo-elements return no matches instead of throwing.
These tests run on every pass. They must stay marked as expected failures until
the validation is fixed; Vitest fails the run if an expected failure starts passing.

The WPT baseline also records failures, not skipped tests. Every listed case runs.
The only WPT skip is a page with no subtests selected by an explicit filter.

> [!IMPORTANT]
> Do not update expectations to hide a regression. Review engine changes and test results first.

To update expectations after review:

```sh
WPT_UPDATE_EXPECTATIONS=1 pnpm run test:upstream
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
