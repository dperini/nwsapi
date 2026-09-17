# WPT `:has()` comparison

On September 17, 2026, the maintenance and v3 branches were checked against the same pinned WPT pages in Chrome for Testing 154.0.8037.0.

| `nwsapi` branch | Revision | Passed | Failed | Total |
| --- | --- | ---: | ---: | ---: |
| `master` (v2) | `932caf983e1ac7267bec42886595fda58edacf1f` | 105 | 7 | 112 |
| `prerelease/3.0.0` (v3) | `f1347c9ddb359c22255ebed511b6ee41335fa2ff` | 112 | 0 | 112 |

The selection contains four DOM matching pages with 78 subtests and three parsing pages with 34 subtests. Both branches pass every subtest in the matching pages. The seven maintenance failures are in the parsing pages, including one direct matching test for nested `:has()` inside forgiving lists.

## Maintenance failures

| Case | Expected behavior | Maintenance result |
| --- | --- | --- |
| `.a:has(.b:has(.c))` | Reject nested `:has()` with `SyntaxError`. | Accepted. |
| Nested `:has()` inside `:is()` or `:where()` | Discard the invalid nested branch. | `:has(:is(:has(*)))` incorrectly matches. The upstream subtest stops at this first failing assertion. |
| `*\|*:has(*)` | Accept a wildcard namespace. | Throws `SyntaxError`. |
| `:has(*\|*)` | Accept a wildcard namespace. | Throws `SyntaxError`. |
| `:has()` | Reject an empty argument in every selector API. | An empty element's `querySelector()` accepts it. |
| `:has(123)` | Reject an invalid selector argument. | Accepted. |
| `:has(.a, 123)` | Reject an unforgiving list containing an invalid argument. | Accepted. |

This comparison records existing behavior. It does not change either engine or classify these failures as expected passes.

## Measurement scope

The WPT revision is `fd983776a7cd19ebcda7a2bcb69c74330ee5d8c9`. Each page receives the engine before its scripts run. The comparison verifies replacement of all eight Document, Element, and DocumentFragment selector methods. Maintenance uses the unchanged bytes from `master:src/nwsapi.js`. v3 uses its built `dist/nwsapi.js`.

The matching pages are `has-basic.html`, `has-relative-argument.html`, `has-argument-with-explicit-scope.html`, and `has-matches-to-uninserted-elements.html` under `css/selectors/`. The parsing pages are `parse-has.html`, `parse-has-disallow-nesting-has-inside-has.html`, and `parse-has-forgiving-selector.html` under `css/selectors/parsing/`.

Parsing pages use the repository's existing selector-validity helper, which checks the installed DOM APIs. CSSOM serialization is outside this measurement. The nested-selector page also retains its direct `matches()` assertions. Rendering, stylesheet invalidation, screenshot, and crash-only tests are excluded. No subtests or failure results are filtered within a selected page.

The filename selection also finds `parse-has-slotted.tentative.html`. This tests the separate `:has-slotted` pseudo-class and is excluded from the table above. Maintenance passes 4 of its 23 subtests. v3 passes all 23.

The ordinary v3 runner passed all eight pages with this command:

```sh
pnpm run test:wpt --grep '/css/selectors/(has-|parsing/parse-has)' --reporter=dot,json
```

The standalone branch comparison reproduced the ordinary runner's v3 counts, engine hash, WPT revision, browser version, and harness outcomes for every page. All page harnesses completed successfully on both branches. The [recorded results](../../../assets/repo/bench/wpt-has-comparison.json) contain the full subtest names, statuses, failure messages, and engine hashes. The table totals are sums of pages whose `group` is `has`.
