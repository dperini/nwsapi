# Selector compatibility

`nwsapi` supports filtered child positions, namespace-aware XML matching, inherited language ranges, shadow-host queries, and the selector grammar covered by the selected WPT suite. All 7,445 selected WPT subtests pass. Browser-owned states use the host's saved matching method when available. These results describe the tested inputs and host provisions, not complete CSS conformance.

## Evidence and scope

The [WPT summary](../../../assets/repo/bench/wpt-summary.json) covers 141 pages in Chromium 151.0.7922.34. It records the executed source hash, pinned upstream revision, and individual page results. The same selected inputs run against generated source and the minified distribution. The [runner documentation](../testing/upstream.md) explains the selection and adaptations.

The separate [browser comparison](../../../assets/repo/bench/selector-compatibility.json) uses Chrome for Testing 153.0.8010.12 without added experimental feature flags. It compares `nwsapi` 2.3.0-prerelease, its adapter, and the local source of `@asamuzakjp/dom-selector` 9.1.1. The report records repository revisions and executed bundle hashes. A source hash identifies an uncommitted build more precisely than its recorded `HEAD`.

The comparison includes 171 selector and context cases and five adapter comparisons. There are 25 native-versus-core differences among the selector cases. Inputs deliberately exercise possible gaps, repeated state changes, and library extensions. Their disagreement count is not a compatibility percentage or a count of separate missing features. `CSS.supports()` results are recorded separately from query results because accepted syntax alone does not establish matching behavior.

## Matching behavior

| Area                     | Tested behavior                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtered child positions | `:nth-child(An+B of S)` and `:nth-last-child(An+B of S)` count only matching siblings. Tests cover selector lists, nested filters, fragments, detached nodes, and mutations. Invalid filters throw before candidate lookup.     |
| XML element names        | Bare names and wildcard namespaces find prefixed elements by local name while preserving XML case. Document, element, fragment, first-result, matching, and legacy routes are covered.                                          |
| Typed sibling positions  | Siblings share a type only when both their local name and namespace match. Forward, reverse, first, last, and only positions use this rule.                                                                                     |
| Namespaced attributes    | Wildcard namespaces inspect every attribute with the requested local name. Empty namespaces exclude namespaced attributes. Attribute suffixes do not count as exact local names.                                                |
| Attribute casing         | Default HTML value folding applies only in HTML documents and to elements in the HTML namespace. Explicit `i` and `s` flags override that default. Cross-document matching refreshes the document rules before reusing a query. |
| Namespace prefixes       | DOM selector APIs reject named CSS namespace prefixes. An XML `xmlns` declaration is not a CSS namespace resolver.                                                                                                              |
| Language                 | Language matching follows inherited HTML `lang` and XML `xml:lang`. Range matching compares subtags, rejects subtags longer than eight characters, and does not cross a singleton extension boundary.                           |
| Shadow hosts             | The tested `:host > slot`, `:host(#id) > slot`, and `:host-context(body) > slot` queries traverse the relevant shadow host. Hosts outside that shadow scope do not qualify.                                                     |
| Slots                    | `:has-slotted` reads flattened assigned nodes, including text. Manual reassignment and removal change the next result. The functional form has separate argument validation.                                                    |
| Compiler state           | Positional indexes belong to the current query. Resolver completion and exceptions clear temporary positional state. Callbacks that can change the tree use fresh filtered state.                                               |

The 276 attribute-casing WPT cases repeat the rules across 46 attributes and six document or namespace contexts. They provide breadth across inputs rather than 276 independent features. Filtered-position tests also check read counts: a selection and a first-result search each read a 200-sibling group once.

## Pseudo-elements and browser states

The parser validates pseudo-element names, arguments, and allowed continuations. Covered families include parts, slots, markers, highlights, search text, scroll buttons, form-control pseudo-elements, and view transitions. Valid pseudo-element selectors produce no DOM elements. Invalid forms such as `::selection:hover`, `::before *`, `::slotted(*).class`, and pseudo-elements inside strict `:not()` arguments throw even with empty query contexts. The compiler retains its existing synthetic pseudo-element candidate interface.

`:state()`, `:user-valid`, `:user-invalid`, active view-transition states, interest states, and scroll-target states use native matching when the host supports them. Saved native methods remain available after `install()`. Delegation detection prevents a host matcher that calls back into `nwsapi` from recursing indefinitely. A host without the required native state returns no match. The engine does not infer private custom-element state or user interaction from public attributes.

Positive browser fixtures exercise custom states held in private `ElementInternals`, interacted form controls, view transitions, interest invokers, dialogs, popovers, and shadow slots. Scroll-target checks cover syntax and inactive results. They do not establish active scroll matching.

The tentative switch-control WPT page requires a reflected `HTMLInputElement.switch` property that the tested Chromium build lacks. A page-specific helper supplies boolean attribute reflection while preserving a native implementation if present. Selector results still come from `nwsapi`. The checkbox `:indeterminate` rule excludes switch controls. This fixture provision does not establish native switch support.

Some accepted inputs come from tentative WPT tests or CSS drafts. The tested Chrome 153 build rejects `:has-slotted`, although the library implements the covered DOM behavior. It also rejects several library extensions, including `:heading`, `:closed`, some media states, and explicit attribute `s` flags. CSS Working Group drafts use their own publication process, described by [Selectors Level 4](https://drafts.csswg.org/selectors/) and [Selectors Level 5](https://www.w3.org/TR/selectors-5/). JavaScript's TC39 Stage 3 label does not apply to these selectors.

## Unicode directionality and identifiers

The portable `:dir()` fallback uses Unicode 17 data from [`@unicode/unicode-17.0.0`](https://github.com/node-unicode/unicode-17.0.0). The package is a `catalog:` development dependency. [`src/external/unicode.js`](../../../src/external/unicode.js) selects only the `Bidi_Class` L, R, and AL expressions. Its sibling `unicode.d.ts` describes those exports. Rolldown produces the corresponding `.js` and `.d.ts` paths under `dist/external/` and embeds the selected data in the standalone engine. Published engine use does not require the Unicode package.

The three expressions are shared outside engine instances. The fallback follows the [HTML directionality rules](https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute), including the first strong character, explicit and inherited direction, automatic direction, excluded descendants, control values, and shadow slots. It reads the live DOM without caching text or results. A supported native `:dir()` check avoids computing the fallback.

Tests force the fallback for both generated source and the minified build. They cover neutral prefixes, mixed Hebrew and Latin text, Arabic, Adlam, Unicode 17 scripts, direction marks, input and textarea values, shadow inheritance, assignments, and mutations. Bundle tests compare all range boundaries and their neighbors with the Unicode package's range data.

Selector identifiers follow CSS grammar. They are not JavaScript variable names, so JavaScript's `ID_Start` and `ID_Continue` tables do not define their accepted characters. The [ECMAScript grammar](https://tc39.es/ecma262/#sec-names-and-keywords) and [CSS Syntax grammar](https://drafts.csswg.org/css-syntax/#ident-start-code-point) describe different rules. The code separates identifier starts from continuations, rejects unescaped digit starts, and accepts the non-ASCII range used by the tested browser. Tests include `ƪ`, `Ɂ`, `ʔ`, `ʡ`, `ใ`, `ໃ`, `ǃ`, supplementary characters, Unicode 17 scripts, and emoji.

The current CSS Syntax draft narrows unescaped non-ASCII identifiers beyond the browser behavior observed here. Chrome 153 still accepts tested C1 controls, direction controls, and private-use characters that the draft excludes. The library preserves that browser behavior. CSS escapes remain a separate route for characters that cannot appear literally. No Unicode identifier-property tables are bundled.

## Remaining differences

| Area                     | Recorded limitation                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Element scope            | The tested `element.matches(':scope')` case differs from the browser. Matching and selection still share context state in routes that require distinct scope semantics.                                                                          |
| Foreign elements in HTML | Some programmatically prefixed elements are omitted by HTML type lookup or differ in case handling. XML namespace fixes do not establish parity for every HTML candidate-lookup route.                                                           |
| CSS comments             | Valid examples such as `.item/**/.special` and `p:nth-child(odd/**/of .item)` are not fully supported.                                                                                                                                           |
| Language syntax          | The current language parser does not implement every quoted or extended language-range form.                                                                                                                                                     |
| Browser syntax           | Chrome accepts `::column`, `:state(initial)`, and a comma-separated `:active-view-transition-type()` case that the core rejects. WPT custom-state validation rejects CSS-wide keywords, so the pinned WPT expectations differ from this browser. |
| Stylesheet analysis      | The adapter's `extractSubjects()` and `check()` results differ from the comparison library. These methods are separate from DOM query correctness.                                                                                               |
| Execution policy         | Compiled selectors use `Function()`. In the recorded enforced-CSP probe, complex core queries throw `EvalError` when dynamic code generation is blocked. Simple direct lookup can still work.                                                    |

The reviewed `@asamuzakjp/dom-selector` source combines a faster matcher with a `css-tree` AST evaluator in the same package. Its entry class selects a route based on the selector and document context. Its AST route supports the recorded enforced-CSP queries. The comparison also exposes differences in private custom states, user validity, attribute namespaces, modal dialogs, and popovers. Each observation applies to its fixture and executed version.

The [API reference](api.md) documents the additional compiler, configuration, lookup, installation, and extension methods exposed by `nwsapi`. A larger public API does not imply broader CSS conformance. Retained-heap measurements in the [performance journal](../perf/journal.md) measure incremental engine allocation after documents exist. They do not measure complete document construction or replace an application workload.

## Reproduce the evidence

```sh
pnpm run build
node scripts/repo/bench/selector-compatibility.mts \
  --browser '/path/to/Chrome for Testing' \
  --expect-major 153 \
  --competitor ../domSelector
pnpm run test:wpt
NWSAPI_MINIFIED=1 pnpm run test:wpt
```

The comparison uses [tracked fixtures](../../../test/repo/fixtures/selectors/compatibility.json), intercepted requests, and no live site. Its report records input hashes and dependency versions. The WPT [scope check](../testing/wpt-runner.md#scope-check) parses executed pages and helpers before the browser runs. Explicit adapters remove rendering assertions while retaining the selected upstream inputs and acceptance expectations.
