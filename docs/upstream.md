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

The runner uses the pages in [the test manifest](../test/upstream/manifest.mts), including a local regression page.
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

To test the minified build:

```sh
NWSAPI_MINIFIED=1 pnpm run test:upstream
```

</details>

<details>
<summary>Review known failures</summary>

[expectations.json](../test/upstream/expectations.json) records known failures.
Unexpected failures fail the run. Unexpected passes appear in the report for review.

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
node test/upstream/sections.mts
```

</details>
