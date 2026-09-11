# Selector compatibility

`nwsapi` parses selectors and matches DOM elements. It supports filtered child positions, XML namespaces, shadow contexts, and live browser states. Rendering and layout are outside its scope.

## Support policy

We target current standards and features enabled by default in Chrome stable or beta. Tests use a pinned Chrome beta. Some supported standard and draft selectors are ahead of Chrome. Acceptance beyond Chrome is different from returning incorrect matches for a selector Chrome supports.

The [browser updater](../testing/browser.md) refreshes the pin during `pnpm run update`. The [WPT process](../testing/upstream.md) selects parsing and matching tests.

## Comparison results

<details>
<summary>How the comparisons work</summary>

Both libraries receive the same fixtures. Agreement with Chrome means identical ordered matches or the same error type. The 200 cases investigate specific gaps and extensions. They are not a percentage of all CSS support. Five adapter API checks are reported separately.

The WPT suite tests `nwsapi` only. It separates upstream cases from local regressions and counts known failures. The larger [discovered pool](../testing/wpt-inventory.md#native-support-pool) is not a measured engine pass count.

The reports record browser versions, source hashes, and upstream revisions. The chart generator checks that the inputs use matching builds and browser versions.

</details>

<!-- compliance-summary:start -->

![Selector parsing and matching against Chrome](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/selector-compliance.svg?v=e74a45a733b8)

Of 200 targeted cases, 185 use Chrome as their oracle. In those cases, `nwsapi` agrees with Chrome on **185**, compared with **129** for the local source of `@asamuzakjp/dom-selector` 9.1.1. Agreement means the same ordered results or the same error type. 15 reviewed standard, draft, or library extension cases are reported separately because Chrome rejects their syntax. They count as neither passes nor failures. The raw report retains all 200 outcomes.

| Outcome against Chrome | Cases |
| --- | ---: |
| Both libraries agree | 129 |
| Only `nwsapi` agrees | 56 |
| Only `@asamuzakjp/dom-selector` agrees | 0 |
| Neither library agrees | 0 |

![Selected WPT inputs and local regressions](https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/wpt-compliance.svg?v=4d17c8d7f5f7)

The executed suite passes **7,716 of 7,800 upstream WPT subtests** across 171 pages, plus **77 of 77 local regression cases** across 19 pages. Its 84 known failures remain visible. Adaptations remove rendering checks while preserving selector inputs. This suite measures `nwsapi` only. It does not establish a WPT result for `@asamuzakjp/dom-selector`.

The reports use Chrome **154.0.8037.0** and WPT revision `fd983776a7cd`. The [browser report](../../../assets/repo/bench/selector-compatibility.json), [page-level WPT report](../../../assets/repo/bench/wpt-summary.json), and [chart data](../../../assets/repo/bench/compliance-summary.json) retain the evidence.

<!-- compliance-summary:end -->

## Supported behavior

| Area | Behavior |
| --- | --- |
| Child positions | Filtered `:nth-child()` and `:nth-last-child()` support lists, nested filters, and DOM mutations. |
| XML | Element names preserve case. Type positions compare both namespace and local name. Attribute matching respects namespace constraints. |
| Attributes | HTML value folding applies only in the appropriate HTML context. Explicit `i` and `s` flags override it. Missing IDs and classes do not match the text `null`. |
| Language and direction | Language follows inherited `lang` and `xml:lang`. The portable direction fallback uses Unicode 17 data. |
| Shadow trees | Host queries, slots, language inheritance, and focus follow the tested shadow context. |
| Live state | Queries read changing host state. Dialog and fullscreen matching use native confirmation when public properties cannot establish the answer. |

Public `match()` scopes `:scope` to its subject. `closest()` keeps the original subject as its scope while walking ancestors. Named CSS namespace prefixes require a resolver that DOM selector APIs do not provide.

See the [API reference](api.md) for methods and configuration, and [display-state matching](display-state.md) for dialogs, fullscreen, and delegated hosts.

## Differences and limitations

The 15 separately reported cases are not all Chrome bugs:

| Cases | Reason |
| --- | --- |
| 6 | Chrome lacks tested [Selectors Level 4](https://drafts.csswg.org/selectors/) syntax for quoted or list `:lang()`, attribute `s` flags, and media states. |
| 8 | [Selectors Level 5](https://drafts.csswg.org/selectors-5/) and [CSS Shadow](https://drafts.csswg.org/css-shadow-1/) describe the tested headings, columns, current elements, and slots. These are draft features. |
| 1 | `:closed` is a library extension. The current spec only mentions it as a possible future addition. |

These cases are neither native passes nor native failures. Their results remain in the report. The [classification script](../../../scripts/repo/bench/selector-extensions.mts) records the reviewed syntax and sources. Classification applies equally to both libraries. New Chrome support automatically returns a case to the native comparison. Unreviewed disagreements remain failures.

The selected WPT suite has 84 failures for draft heading offsets and resets. Basic `:heading` support does not implement those behaviors. The switch-control fixture supplies missing host reflection, so its result does not establish native browser support.

Browser-owned states require host support. `nwsapi` cannot recover private custom-element state or dialog state that a host does not implement. Scroll-target tests cover parsing and inactive results, not active scrolling.

Compiled queries use `Function()`. A Content Security Policy that blocks dynamic code generation prevents complex compiled queries. Simple direct lookup can still work.

The adapter's `extractSubjects()` and `check()` have separate stylesheet contracts. Subject hints preserve potentially applicable rules. Pseudo-element branches do not produce element style matches.

## Unicode

The portable `:dir()` implementation bundles only the L, R, and AL direction classes from `@unicode/unicode-17.0.0`. It reads live DOM state and uses native matching when supported.

CSS identifiers follow CSS grammar, not JavaScript's identifier tables. The engine preserves the tested browser's acceptance of non-ASCII characters. The post-build checks enforce ES5-compatible escapes in the bundled Unicode expressions.

## Reproduce the evidence

```sh
pnpm run build
pnpm run setup:browser
node scripts/repo/bench/selector-compatibility.mts --competitor ../domSelector
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/nwsapi-wpt-report.json \
  pnpm exec playwright test --config .config/playwright.config.mts --reporter=dot,json
node scripts/repo/gen/wpt-summary.mts --input /tmp/nwsapi-wpt-report.json
pnpm run gen:compliance
NWSAPI_DISTRIBUTION=1 pnpm run test:wpt
```

Use a unique temporary report path when runs overlap. The comparison uses [tracked fixtures](../../../test/repo/common/fixture/selector/compatibility.json) and intercepted requests. The [WPT scope check](../testing/wpt-runner.md#scope-check) validates selected pages and adapters before browser execution.
