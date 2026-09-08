# WPT runner

See [setup and baseline maintenance](upstream.md).

Runner files live under `test/repo/e2e/upstream/`.

`manifest.mts` selects the pages. `sections.mts` maps subtests to upstream
selector sections. `wpt.spec.mts` installs `nwsapi`, collects testharness results,
and compares failures with `expectations.json`.

`fixtures/parsing-helpers.js` sends upstream selector-validity inputs through
the installed APIs. `parsing.mts` uses HTML and JavaScript parsers to adapt
pages that embed helpers or mix direct parsing cases with rendering tests.
The adapters preserve the selected inputs and reject upstream changes that
need review.

`fixtures/structural-selectors.html` reuses upstream DOM fixtures for query
assertions about filtered child positions and XML sibling types. It does not
count the original rendering assertions as engine tests.

`scripts/repo/gen/wpt-summary.mts` reads a complete Playwright JSON report and
writes the tracked summary in `assets/repo/bench/wpt-summary.json`. Passing
subtests and known failures remain separate in that report.
