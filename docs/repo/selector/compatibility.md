# Selector compatibility

`nwsapi` supports filtered child positions, namespace-aware XML matching, inherited language ranges, shadow-host queries, and the selector grammar covered by the selected WPT suite. Of 7,877 selected WPT subtests, 7,793 pass and 84 expose unsupported draft heading-offset behavior or missing host reflection. Browser-owned states use the host's saved matching method when available. These results describe the tested inputs and host provisions, not complete CSS conformance.

## Evidence and scope

The [WPT summary](../../../assets/repo/bench/wpt-summary.json) covers 190 pages in Chrome for Testing 153.0.8010.12. It records the executed source hash, pinned upstream revision, and individual page results. The same selected inputs run against the readable core, with a separate pass for legacy hooks. The [runner documentation](../testing/upstream.md) explains the selection and adaptations.

The separate [browser comparison](../../../assets/repo/bench/selector-compatibility.json) uses Chrome for Testing 153.0.8010.12 without added experimental feature flags. It compares `nwsapi` 2.3.0-prerelease, its adapter, and the local source of `@asamuzakjp/dom-selector` 9.1.1. The report records repository revisions and executed bundle hashes. A source hash identifies an uncommitted build more precisely than its recorded `HEAD`.

The comparison includes 200 selector and context cases and five adapter comparisons. There are 15 native-versus-core differences among the selector cases. Inputs deliberately exercise possible gaps, repeated state changes, and library extensions. Their disagreement count is not a compatibility percentage or a count of separate missing features. `CSS.supports()` results are recorded separately from query results because accepted syntax alone does not establish matching behavior.

## Comparison results

In the [recorded browser comparison](../../../assets/repo/bench/selector-compatibility.json), `nwsapi` agrees with Chrome on **185 of 200 cases**, compared with **131 of 200** for `@asamuzakjp/dom-selector` 9.1.1. Agreement requires the same ordered results or the same error type. This is 54 more matching outcomes in this deliberately targeted set.

| Outcome against Chrome | Cases |
| --- | ---: |
| Both libraries agree | 129 |
| Only `nwsapi` agrees | 56 |
| Only `@asamuzakjp/dom-selector` agrees | 2 |
| Neither library agrees | 13 |

The expansion from 171 to 200 cases adds eight filtered-position cases, five relational selector cases, four CSS comment cases, six escaped-identifier or missing-ID/class cases, and six XML namespace cases. These check parsing and ordered DOM matches without rendering assertions. The added cases cover both accepted and rejected syntax. They were selected before comparing either library’s outcomes.

The cases include selector parsing, XML attributes, shadow contexts, and changing browser-owned states. They were chosen to investigate gaps, so these counts are not a general compliance score. The five adapter API comparisons are separate. The selected WPT results above run against `nwsapi` and do not establish a WPT pass count for the comparison library.

## Matching behavior

| Area                     | Tested behavior                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtered child positions | `:nth-child(An+B of S)` and `:nth-last-child(An+B of S)` count only matching siblings. Tests cover selector lists, nested filters, fragments, detached nodes, and mutations. Invalid filters throw before candidate lookup.     |
| XML element names        | Bare names and wildcard namespaces find prefixed elements by local name while preserving XML case. Document, element, fragment, first-result, matching, and legacy routes are covered.                                          |
| Typed sibling positions  | Siblings share a type only when both their local name and namespace match. Forward, reverse, first, last, and only positions use this rule.                                                                                     |
| Namespaced attributes    | Wildcard namespaces inspect every attribute with the requested local name. Empty namespaces exclude namespaced attributes. Attribute suffixes do not count as exact local names.                                                |
| Attribute casing         | Default HTML value folding applies only in HTML documents and to elements in the HTML namespace. Explicit `i` and `s` flags override that default. Cross-document matching refreshes the document rules before reusing a query. |
| Namespace prefixes       | DOM selector APIs reject named CSS namespace prefixes. An XML `xmlns` declaration is not a CSS namespace resolver.                                                                                                              |
| Language                 | Language matching follows inherited HTML `lang` and XML `xml:lang`. It accepts identifiers, quoted ranges, and lists. Extended ranges compare subtags without crossing singleton extension boundaries.                           |
| Shadow hosts             | The tested `:host > slot`, `:host(#id) > slot`, and `:host-context(body) > slot` queries traverse the relevant shadow host. Hosts outside that shadow scope do not qualify.                                                     |
| Slots                    | `:has-slotted` reads flattened assigned nodes, including text. Manual reassignment and removal change the next result. The functional form has separate argument validation.                                                    |
| Compiler state           | Positional indexes belong to the current query. Resolver completion and exceptions clear temporary positional state. Callbacks that can change the tree use fresh filtered state.                                               |

Public `match()` scopes `:scope` to the subject element. `closest()` preserves the original subject as its scope while walking ancestors. Selection and internal predicates retain their query context. Nested calls restore the surrounding scope.

The 276 attribute-casing WPT cases repeat the rules across 46 attributes and six document or namespace contexts. They provide breadth across inputs rather than 276 independent features. Filtered-position tests also check read counts: a selection and a first-result search each read a 200-sibling group once.

## Missing ID and class attributes

`#null` and `.null` require a literal `"null"` attribute value. Missing and empty attributes do not match. Regression tests cover matching and closest-ancestor lookup after attributes are added and removed, including cached calls, XML, legacy hooks, and the adapter. Hosts without a `className` property use an empty string when the class attribute is absent, preventing regular expressions from coercing a missing value to `"null"`.

This also covers the failure described by the [upstream fix](https://github.com/asamuzaK/domSelector/commit/c5b01a422d1520a7e24773cf7c45a43f4accd4e0). Ordinary DOM matching already returned the expected results. The attribute-reader fallback needed the correction.

## Comments and foreign HTML elements

Comments are consumed between CSS tokens. Quoted comment text stays literal, and removing a comment cannot join two identifiers or manufacture a function token. Tests cover filtered child positions, attribute flags, escaped identifiers, adjacent comments, and comments ending at EOF. A browser comparison inserts comments at every position in representative selectors and checks selection, first-result lookup, and matching on cold and cached calls.

HTML type queries include prefixed and foreign-namespace elements. Candidate lookup and compiled predicates use the browser's ASCII case rules. XML matching remains case-sensitive. Ordinary HTML trees retain native tag lookup. A weak cache records whether a tree needs broader candidates, and child-list mutations invalidate it before the next query. Minimal adapter hosts use the document window for observation. Weak observer callbacks avoid retaining the engine closure. Tests cover detached fragments, document switching, namespace-sensitive sibling positions, and legacy mode.

## jsdom regression coverage

The [engine-switch PR](https://github.com/jsdom/jsdom/pull/3854) lists 19 issues. The [selector regression suite](../../../test/repo/unit/jsdom-selector-regressions.test.mts) covers their selector-layer reproductions. These include XML namespaces, scope with numeric IDs and colon-containing classes, nested logical selectors, uppercase names and attribute flags, disabled fieldsets, inactive elements, invalid identifiers, shadow hosts, and custom-element definition state.

The unit stylesheet case checks the selector used by `getComputedStyle()`. The separate integration case also checks the computed color. The React-generated ID case checks a scope query and a properly escaped ID. The unescaped colon-containing selector remains invalid. The XML move case checks the selected destination and the resulting move.

The public DOM integration suite also runs the linked selector cases through `jsdom`. The stylesheet reproduction checks `getComputedStyle()` before and after a matching-state mutation. Isolated package tests exercise Testing Library role, label, and test-ID lookups against the installed adapter.

The [host workload report](../../../assets/repo/bench/jsdom-workload.json) records 2,808 passing subtests from `Range-mutations-dataChange.html` in each trial, along with construction, query, disposal, and profile measurements. These checks do not establish complete jsdom integration coverage or downstream maintainer acceptance.

## Host-supplied readers

When `jsdom` supplies `idlUtils`, the adapter can use implementation `getAttribute()` and `hasAttribute()` methods for ordinary attribute matching. When it also supplies a compatible `domSymbolTree`, parent and sibling readers use that tree's methods. Results remain public DOM nodes. Production code does not deep-import `jsdom`, inspect symbol descriptions, or read raw tree records or `_attributeList`.

The adapter checks wrapper identity and missing and empty attribute behavior on detached probe elements before selecting the readers. Tree checks verify parent and sibling relationships against the same host. Missing or incompatible capabilities keep the public route. Nodes that cannot be unwrapped also use public readers. Capability checks reduce integration risk but do not promise compatibility with every future host implementation.

Reader selection happens before the adapter creates its engine. Compiled selectors retain direct public reads when host readers are absent. An explicitly supplied engine through `DOMSelector.use()` keeps its own readers. Legacy mode keeps its registered legacy readers. Tests cover XML, mutations, text and comment siblings, fragments, adoption, shadow boundaries, nested callbacks, and fallback behavior. Ordinary HTML attribute matching through host readers also bypasses overridden instance attribute methods.

The [performance journal](../perf/journal.md#use-host-supplied-attribute-and-tree-readers) records the comparison and retention scope. These readers use the host options already supplied by the tested `jsdom` release. The unmerged `getAttributeList` callback is not required.

## Pseudo-elements and browser states

The parser validates pseudo-element names, arguments, and allowed continuations. Covered families include parts, slots, markers, highlights, search text, scroll buttons, form-control pseudo-elements, and view transitions. Valid built-in pseudo-element selectors produce no DOM elements. Invalid forms such as `::selection:hover`, `::before *`, `::slotted(*).class`, and pseudo-elements inside strict `:not()` arguments throw even with empty query contexts. The compiler retains its existing synthetic pseudo-element candidate interface. Registered double-colon extensions keep their callbacks and can compose with attributes, classes, and logical selectors. They do not replace valid built-in pseudo-elements.

`:state()`, `:user-valid`, `:user-invalid`, active view-transition states, interest states, and scroll-target states use native matching when the host supports them. Saved native methods remain available after `install()`. Delegation detection prevents a host matcher that calls back into `nwsapi` from recursing indefinitely. A host without the required native state returns no match. The engine does not infer private custom-element state or user interaction from public attributes.

Positive browser fixtures exercise custom states held in private `ElementInternals`, interacted form controls, view transitions, interest invokers, dialogs, popovers, and shadow slots. Scroll-target checks cover syntax and inactive results. They do not establish active scroll matching.

The tentative switch-control WPT page requires a reflected `HTMLInputElement.switch` property that the tested Chromium build lacks. A page-specific helper supplies boolean attribute reflection while preserving a native implementation if present. Selector results still come from `nwsapi`. The checkbox `:indeterminate` rule excludes switch controls. This fixture provision does not establish native switch support.

Some accepted inputs come from tentative WPT tests or CSS drafts. The tested Chrome 153 build rejects `:has-slotted`, although the library implements the covered DOM behavior. It also rejects several library extensions, including `:heading`, `:closed`, some media states, and explicit attribute `s` flags. CSS Working Group drafts use their own publication process, described by [Selectors Level 4](https://drafts.csswg.org/selectors/) and [Selectors Level 5](https://www.w3.org/TR/selectors-5/). JavaScript's TC39 Stage 3 label does not apply to these selectors.

## Unicode directionality and identifiers

The portable `:dir()` fallback uses Unicode 17 data from [`@unicode/unicode-17.0.0`](https://github.com/node-unicode/unicode-17.0.0). The package is a `catalog:` development dependency. [`src/external/unicode.js`](../../../src/external/unicode.js) selects only the `Bidi_Class` L, R, and AL expressions. Its sibling `unicode.d.ts` describes those exports. Rolldown produces the corresponding `.js` and `.d.ts` paths under `dist/external/` and embeds the selected data in the standalone engine. Published engine use does not require the Unicode package.

The three expressions are shared outside engine instances. The fallback follows the [HTML directionality rules](https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute), including the first strong character, explicit and inherited direction, automatic direction, excluded descendants, control values, and shadow slots. It reads the live DOM without caching text or results. A supported native `:dir()` check avoids computing the fallback.

Tests force the fallback with the modern core and with legacy hooks enabled. They cover neutral prefixes, mixed Hebrew and Latin text, Arabic, Adlam, Unicode 17 scripts, direction marks, input and textarea values, shadow inheritance, assignments, and mutations. Bundle tests compare all range boundaries and their neighbors with the Unicode package's range data.

Selector identifiers follow CSS grammar. They are not JavaScript variable names, so JavaScript's `ID_Start` and `ID_Continue` tables do not define their accepted characters. The [ECMAScript grammar](https://tc39.es/ecma262/#sec-names-and-keywords) and [CSS Syntax grammar](https://drafts.csswg.org/css-syntax/#ident-start-code-point) describe different rules. The code separates identifier starts from continuations, rejects unescaped digit starts, and accepts the non-ASCII range used by the tested browser. Tests include `ƪ`, `Ɂ`, `ʔ`, `ʡ`, `ใ`, `ໃ`, `ǃ`, supplementary characters, Unicode 17 scripts, and emoji.

The current CSS Syntax draft narrows unescaped non-ASCII identifiers beyond the browser behavior observed here. Chrome 153 still accepts tested C1 controls, direction controls, and private-use characters that the draft excludes. The library preserves that browser behavior. CSS escapes remain a separate route for characters that cannot appear literally. No Unicode identifier-property tables are bundled.

## Remaining differences

| Area                     | Recorded limitation                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |

| Stylesheet analysis      | The adapter's `extractSubjects()` and `check()` results differ from the comparison library. These methods are separate from DOM query correctness.                                                                                               |
| Execution policy         | Compiled selectors use `Function()`. In the recorded enforced-CSP probe, complex core queries throw `EvalError` when dynamic code generation is blocked. Simple direct lookup can still work.                                                    |

Quoted and list forms of `:lang()` follow the [Selectors language grammar](https://drafts.csswg.org/selectors/#lang-pseudo). The tested Chrome 153 build rejects the two recorded forms, while both libraries accept them. These additions raise the selector-case disagreement count by two. An empty quoted range matches untagged language, and a quoted wildcard matches tagged language.

The adapter deliberately returns a wildcard subject hint so no stylesheet rule is excluded before `check()` evaluates it. It excludes pseudo-element branches from element style results because the host does not compute pseudo-element styles. These contract choices explain the recorded adapter differences.

The reviewed `@asamuzakjp/dom-selector` source combines a faster matcher with a `css-tree` AST evaluator in the same package. Its entry class selects a route based on the selector and document context. Its AST route supports the recorded enforced-CSP queries. The comparison also exposes differences in private custom states, user validity, attribute namespaces, modal dialogs, and popovers. Each observation applies to its fixture and executed version.

The [API reference](api.md) documents the additional compiler, configuration, lookup, installation, and extension methods exposed by `nwsapi`. A larger public API does not imply broader CSS conformance. The native-browser retained-heap chart measures incremental engine allocation after documents exist. The [host workload section](../perf/journal.md#host-workload-and-adapter-classification) separately measures document construction and integrated queries. Neither measurement establishes performance for every application.

## Reproduce the evidence

```sh
pnpm run build
node scripts/repo/bench/selector-compatibility.mts \
  --browser '/path/to/Chrome for Testing' \
  --expect-major 153 \
  --competitor ../domSelector
pnpm run test:wpt
NWSAPI_DISTRIBUTION=1 pnpm run test:wpt
```

The comparison uses [tracked fixtures](../../../test/repo/fixtures/selectors/compatibility.json), intercepted requests, and no live site. Its report records input hashes and dependency versions. The WPT [scope check](../testing/wpt-runner.md#scope-check) parses executed pages and helpers before the browser runs. Explicit adapters remove rendering assertions while retaining the selected upstream inputs and acceptance expectations.

## Browser syntax follow-up

The three recorded syntax differences are resolved. `::column` is accepted as a non-functional pseudo-element and returns no DOM elements. This does not implement column rendering. `:state()` accepts identifiers such as `initial`, consistent with the [Selectors Level 5 grammar](https://drafts.csswg.org/selectors-5/#state-pseudo). Earlier documentation incorrectly described the pinned `parse-state.html` page as rejecting CSS-wide keywords. That page has no such assertion.

`:active-view-transition-type()` accepts comma-separated custom identifiers, as defined by [View Transitions Level 2](https://drafts.csswg.org/css-view-transitions-2/#active-view-transition-type-pseudo). Empty items, CSS-wide keywords, and whitespace-separated names remain invalid. The [column pseudo-element specification](https://drafts.csswg.org/css-multicol-2/#column-pseudo) defines the rendering concept separately from element queries.

The [focused Chrome 153 report](../../../assets/repo/bench/bounded-browser-syntax.json) records matching custom state, state removal, a matching active transition type, and the result after that transition finishes. Native and engine results agree by element identity. Unit tests also cover empty contexts and legacy mode.

## Draft heading offsets

The expanded WPT selection includes `headingoffset-and-headingreset.html` and `headingoffset-mutations.html`. Their 84 recorded failures remain visible in the [WPT summary](../../../assets/repo/bench/wpt-summary.json). `nwsapi` recognizes headings by their HTML local names but does not yet apply ancestor heading offsets, resets, or their flat-tree mutation rules. Chromium 151 also lacks the `headingOffset` and `headingReset` reflection properties used by these fixtures. Basic `:heading` support should not be read as support for those draft behaviors.

The added matching tests confirm language inheritance across shadow hosts, focus matching through nested shadow hosts, form-associated custom-element states supplied by the host, and disabled options inside ordinary wrappers. Added parsing inputs cover `::column::scroll-marker`, `::before::column`, and permitted states and pseudo-elements after `::details-content`. These are parsing and DOM-matching checks, not rendering assertions.

The tentative WPT universal-highlight inputs are accepted as `::highlight(*)`, including after an element selector. They return no DOM elements, like other pseudo-elements. Chrome 153 rejects this wildcard form, although it accepts the escaped identifier `::highlight(\*)`. This deliberate grammar extension follows the [pinned tentative WPT](https://github.com/web-platform-tests/wpt/blob/fd983776a7cd19ebcda7a2bcb69c74330ee5d8c9/css/css-highlight-api/custom-highlight-universal-parsing-and-computed-style.tentative.html). It does not add highlight rendering or change the recorded browser-comparison results.
