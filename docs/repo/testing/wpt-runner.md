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

[`scripts/repo/check/wpt/source.mts`](../../../scripts/repo/check/wpt/source.mts)
loads the source used by both the runner and its scope check. It also adapts
the three matching pages and wraps upstream `.window.js` files in a page
with testharness. The wrapper executes the original script and rejects
unreviewed `META:` directives. The tentative switch-control page also loads
`fixtures/switch-idl.mts` when the browser lacks the reflected `switch` property.
That helper provides attribute reflection without changing selector behavior.

`fixtures/structural-selectors.html` reuses upstream DOM fixtures for query
assertions about filtered child positions and XML sibling types. It does not
count the original rendering assertions as engine tests.

`scripts/repo/gen/wpt-summary.mts` reads a complete Playwright JSON report and
writes the tracked summary in `assets/repo/bench/wpt-summary.json`. Passing
subtests and known failures remain separate in that report.

## Scope check

Run the check without launching a browser:

```sh
pnpm run check:wpt-scope
```

[`scripts/repo/check/wpt/scope.mts`](../../../scripts/repo/check/wpt/scope.mts)
also runs through Playwright's global setup. It uses `jsdom` to parse HTML
or XHTML and `acorn` to parse JavaScript. TypeScript helpers are stripped
the same way as the test server. Comments and string contents are not
treated as API calls.

The check follows static script dependencies, literal module imports,
inline event handlers, and static iframe fixtures. Shared scripts are
parsed once per mode. Only the two testharness framework scripts are
excluded from inspection. A selected page must load testharness and
contain selector calls in its code or inspected helpers.

The check rejects known computed-style, geometry, canvas-output, CSSOM,
and testdriver APIs. It allows unused geometry reads that flush layout
before a DOM assertion. It also rejects reference comparisons, external
script origins, dynamically created scripts, and nonliteral module paths.
Mixed pages need an explicit source adapter. Each adapter checks its
expected edit count and fails when the upstream structure changes.

This is a static check for known source patterns. Review new helpers and
indirect execution, including strings later inserted as HTML or code.
The check cannot infer every JavaScript alias or prove that a selector
call is the subject of a test. Read the assertions before adding a page.
Stylesheet-only tests can use selectors merely to find their fixtures.

Media WPT pages remain outside this manifest because they need media
resources, server substitutions, and native feature preconditions. They
need a dedicated harness review. Likewise, a `CSS.supports('selector(...)')`
expectation cannot automatically become a DOM query expectation because
their handling of unsupported syntax inside forgiving lists can differ.
