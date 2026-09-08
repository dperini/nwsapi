# Selector compatibility

The comparison found gaps beyond filtered child positions. `nwsapi` now supports `:nth-child(An+B of S)` and `:nth-last-child(An+B of S)` and fixes the tested XML namespace lookups. The expanded WPT suite also exposes attribute case-folding errors in XML and outside the HTML namespace. Language inheritance, element scope matching, shadow-host queries, several browser states, and parts of selector parsing still need work.

## Browser versions and evidence

Chrome 153 is the stable release. Chrome 154 is beta. The [Chrome 153 release notes](https://developer.chrome.com/release-notes/153) and [Chrome 154 beta announcement](https://developer.chrome.com/blog/chrome-154-beta?hl=en) describe different release channels. A beta announcement does not establish stable support.

The recorded comparison uses Chrome for Testing 153.0.8010.12 with no added experimental feature flags. This is a specific milestone 153 build, not a claim about every installed patch. It compares `nwsapi` 2.3.0-prerelease with the local source of `@asamuzakjp/dom-selector` 9.1.1 at `f2ff18a617342b7e252883bde1dd5223300ea6e3`. It also checks the `nwsapi` adapter. The earlier Chromium 151 probes do not establish milestone 153 behavior. Chrome 154 beta was reviewed through its release notes and was not run in this comparison.

The [generated report](../../../assets/repo/bench/selector-compatibility.json) records 171 selector and context cases and five adapter comparisons. There are 68 native versus core disagreements among the selector cases. That count includes repeated state checks and deliberate extensions. It is not a compatibility percentage or a count of separate missing features. The fixtures were chosen to expose possible gaps, so they do not represent an application's selector mix.

The report separates `CSS.supports()` from query results. A successful syntax check does not prove that a state can match. Positive fixtures exercise custom states, user interaction with an email field, an active view transition, interest invokers, modal dialogs, popovers, and shadow slots. The custom-state fixture keeps its `ElementInternals` private to the element.

## What Domenic's review asks us to measure

Domenic's historical comments favor fewer DOM traversals and fewer repeated checks per candidate. His [traversal discussion](https://github.com/asamuzaK/domSelector/issues/38#issuecomment-1890876460) and [request for dispatch profiles](https://github.com/asamuzaK/domSelector/issues/38#issuecomment-2746067360) point toward measuring DOM visits and property reads before spending effort on parser speed alone. These comments are from 2024 and 2025. They are not a current acceptance promise.

For a compound selector, his concrete suggestion was to visit each candidate once and apply its checks together. He also questioned converting an `HTMLCollection` to an array before using it. The useful measurement is work per query: repeated traversal, DOM property reads, collection copies, and temporary allocation. A faster parser alone does not establish that these costs improved.

His [architecture concerns](https://github.com/asamuzaK/domSelector/issues/38#issuecomment-2708707124) also concern correctness and maintenance. A small selector edit should not unexpectedly change XML, case-sensitivity, shadow, or form behavior by selecting a different execution path. He favored keeping both paths under one maintained implementation. Paired tests should vary selector complexity, document type, namespace, connection state, and mutations while checking equivalent results.

The `jsdom` migration review also asked to preserve [benchmarks that expose warm-cache behavior](https://github.com/jsdom/jsdom/pull/3854#discussion_r2034398895), examine [document construction cost](https://github.com/jsdom/jsdom/pull/3854#discussion_r2041100191), and obtain [browser tests and prerelease feedback](https://github.com/jsdom/jsdom/pull/3854#issuecomment-2785151102). Construction, cached queries, DOM changes, and consumer behavior need separate evidence.

His [profiling notes](https://github.com/jsdom/jsdom/issues/3154#issuecomment-2726445990) use an actual WPT workload with `0x` and `clinic flame`. Removing a prominent stack did not automatically produce a large total improvement. We therefore record full query timing alongside profiles. The [performance journal](../perf/journal.md#index-filtered-siblings-once-per-query) describes the measurements for the changes below.

The next performance comparison should separate document construction, the first query, repeated cached queries, and queries after DOM changes. Record dispatch time and fallback frequency for the same inputs. Our retained-heap measurements cover incremental engine allocation after documents exist. They do not measure complete `jsdom` construction or replace an application workload.

The [September 5 comparison job](https://github.com/asamuzaK/domSelector/actions/runs/33934323328/job/101219167283) compares `@asamuzakjp/dom-selector` 9.1.1 with version 8.3.0 inside `jsdom` 30.0.1. It does not include the current `nwsapi` checkout. Its timed operations include mutations, queries, random choices, and assertions. Document preparation happens before timing, and patched `querySelectorAll()` methods return arrays. Its large gains for some complex matching cases identify useful workloads, but they do not establish a current engine ranking or document construction cost.

## What the comparison implementation does well

The reviewed `@asamuzakjp/dom-selector` source keeps its faster matching implementation inside the package. Its [entry class](https://github.com/asamuzaK/domSelector/blob/f2ff18a617342b7e252883bde1dd5223300ea6e3/src/index.js) checks whether a node is connected to the configured HTML document, caches selector eligibility, and attempts that matching path when eligible. Errors can fall through to the AST evaluator. Keeping both paths in the same package addresses Domenic's dependency concern. Their behavior still needs comparison tests.

The AST path handles the tested language, element-scope, and shadow-host cases better. The package also derives useful ID, class, and tag restrictions through `extractSubjects()`. These provide concrete examples for improving the adapter's analysis methods.

Construction eagerly creates a cache, the finder, and the internal matching engine. The default entry cache limit is 4,096 items. `clear()` removes cached results, while `clear(true)` also clears selector caches. Its [event handler](https://github.com/asamuzaK/domSelector/blob/f2ff18a617342b7e252883bde1dd5223300ea6e3/src/js/event.js) registers nine window listeners. Internal teardown exists, but the entry class does not expose a public disposal method. This warrants a repeated construction and disposal measurement. Source structure alone does not establish a memory leak.

## Changes covered by regression tests

| Area                     | Result                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtered child positions | Forward and reverse positions count only siblings that match the filter. Lists, nested selectors, fragments, detached elements, and DOM changes have regression coverage. Invalid filters throw even when there are no candidates. |
| XML type names           | Bare names and wildcard namespaces find prefixed elements by local name. XML case is preserved. Document, element, fragment, first-result, matching, and legacy routes are covered.                                                |
| Typed sibling positions  | Siblings share a type only when both their local name and namespace match. This applies to first, last, only, forward, and reverse type positions.                                                                                 |
| XML attributes           | Wildcard namespaces inspect all matching local names and values. Empty namespaces exclude namespaced attributes, including attributes created without a prefix. Attribute suffixes no longer count as exact local names.           |
| Namespace prefixes       | DOM selector APIs reject named CSS namespace prefixes. An XML `xmlns` declaration does not provide a CSS namespace resolver.                                                                                                       |
| Compiler state           | Positional caches are cleared when a resolver returns or throws. Filtered sibling indexes belong to the current query. Callbacks that can change the tree use fresh filtered state.                                                |

Combinator normalization now scans quoted strings and function arguments. It preserves their spaces and rejects forms such as `:nth-child(+ n)` instead of silently rewriting them. General CSS comment handling remains incomplete.

These namespace fixes cover local-name lookup, attribute namespace selection, and sibling types. They do not fix every XML behavior. The newly selected attribute-value WPT page catches a separate case-folding problem described below.

The tests use both generated source and the minified distribution in a real browser. They also cover repeated calls, callback exceptions, changed classes, moved nodes, reordered candidates, and hosts without namespace lookup methods. A read-count test verifies that a filtered selection and a first-result search each read the 200 siblings once. These checks protect specific routes. They do not establish full selector conformance or prove the absence of every retention path.

## Remaining gaps and priorities

| Area                     | Confirmed behavior and next step                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language matching        | `:lang(en)` misses inherited HTML language and XML `xml:lang`. `:lang(us)` incorrectly matches the root with `lang="en-US"`. Fix inheritance and language-range matching together.                                                                                                                                                        |
| Attribute value casing   | Of 276 new WPT cases, 184 fail because default HTML case-folding also applies in XML and to elements outside the HTML namespace. Base the default on both the element namespace and document type, while preserving explicit case flags.                                                                                                  |
| Element scope            | Native `element.matches(':scope')` is true for the tested paragraph. The core and adapter return false. Define the scope separately for matching, selection, and stylesheet checks.                                                                                                                                                       |
| Foreign elements in HTML | Bare and wildcard type queries omit some programmatically prefixed elements and disagree on case. Both libraries fail some cases. The XML fixes do not close this HTML candidate-lookup gap.                                                                                                                                              |
| CSS comments             | Valid forms such as `.item/**/.special` and `p:nth-child(odd/**/of .item)` throw. Handle comments through selector tokenization rather than a replacement that can alter strings or escapes.                                                                                                                                              |
| Pseudo-elements          | Chrome accepts several pseudo-elements in element queries and returns an empty result. The core throws for forms including `::marker`, `::part(test)`, `::search-text`, `::checkmark`, `::picker-icon`, `::picker(select)`, and view-transition pseudo-elements. Add grammar validation without treating pseudo-elements as DOM elements. |
| Invalid continuations    | `p::before > span` throws in Chrome but produces an empty result in the core. Acceptance and rejection need separate parser tests.                                                                                                                                                                                                        |
| Shadow hosts             | `:host > slot`, `:host(#shadow-host) > slot`, and `:host-context(body) > slot` match slots in the browser and comparison library. The core throws. This needs shadow-aware traversal and scoping.                                                                                                                                         |
| Browser states           | `:state(ready)`, `:user-valid`, `:user-invalid`, active view-transition selectors, and interest selectors have positive native fixtures. The core throws for them. Define the native and server-DOM behavior before adding support.                                                                                                       |
| Scroll target states     | Chrome accepts `:target-current`, `:target-before`, and `:target-after`. The core throws. This audit only covers syntax and inactive results, so positive scroll-state fixtures are still needed.                                                                                                                                         |
| Stylesheet analysis      | The adapter returns unrestricted subjects for simple selectors and excludes pseudo-element branches from `check()`. Improve these contracts through consumer tests before using them as stylesheet optimizations.                                                                                                                         |

The comparison library does not match the custom state stored in unexposed internals or the interacted form states in these fixtures. Its XML attribute matching includes some attributes from the wrong namespace. `nwsapi` matches the tested modal dialog and open popover while the comparison library returns an empty result. Each result describes its fixture, not universal support.

Prioritize the established matching rules first: attribute casing, language inheritance and ranges, scope, and comments. Add valid pseudo-element grammar with paired rejection tests. Then address shadow traversal and host-dependent states with positive fixtures. Keep filtered child positions and namespace regressions running throughout these changes so broader grammar support does not undo them.

## Browser features and specification status

The strongest additions with positive Chrome 153 evidence are custom states, interaction-dependent validity, view-transition states, and interest invokers. Chrome documents [custom states](https://developer.chrome.com/release-notes/125), [user validity](https://developer.chrome.com/blog/new-in-chrome-119), [view-transition types](https://developer.chrome.com/blog/view-transitions-update-io24?hl=en), and [interest invokers](https://developer.chrome.com/blog/new-in-chrome-142?hl=en). Existing native-state helpers provide a possible implementation pattern. A server DOM may not expose the same state, and the adapter must avoid recursion when it replaces native methods.

Keep `:has-slotted` under investigation. The [Chrome 134 beta notes](https://developer.chrome.com/blog/chrome-134-beta) announced it, but the tested Chrome 153 build rejects it in both syntax checks and queries. An old announcement is insufficient evidence of current availability.

The core accepts `:heading`, `:heading()`, `:closed`, media-state extensions, and explicit attribute `s` flags that the tested browser rejects. These are not Chrome parity gains. The browser also rejects the column combinator case tested here. An empty result from an engine does not establish that it implements column matching.

CSS selector proposals follow CSS Working Group specifications, including [Selectors Level 4](https://drafts.csswg.org/selectors/) and [Selectors Level 5](https://www.w3.org/TR/selectors-5/). They do not use TC39's Stage 3 process for JavaScript. Draft status, browser acceptance, and correct matching should be recorded separately.

Chrome 153 changes include a Rust XML parser and new camera and microphone elements. XML parser changes justify exercising the resulting DOM, while ordinary type selectors already accept new element names. Chrome 154 beta adds scroll-marker-group modes and other CSS property or platform changes. Those entries do not by themselves add selector functions to the engine. The scroll-marker behavior is worth watching for future active-state fixtures. Neither release announcement removes the need to test the selector API itself.

## Additional WPT parsing evidence

The [WPT runner](../testing/upstream.md) selects 141 pages with 7,445 subtests. Of those, 6,704 pass and 741 have documented failure reasons. Its 40 adapted parsing pages contribute 1,722 subtests, with 1,176 passing and 546 failing. The [generated summary](../../../assets/repo/bench/wpt-summary.json) records the selected pages and failing names.

The added inputs cover `An+B`, attributes, combinators, logical selectors, custom states, shadow hosts, slots, parts, highlights, scroll buttons, autofill, form-control pseudo-elements, and view-transition pseudo-elements. They expose invalid continuations as well as missing valid syntax. Examples include `::selection:hover`, `::before *`, `::slotted(*).class`, and pseudo-elements inside `:not()` that the core incorrectly accepts.

The harness keeps the upstream input lists but replaces stylesheet serialization checks with selector API validity checks. The mixed part test contributes only its direct parsing cases. An automatic [scope check](../testing/wpt-runner.md#scope-check) parses the executed pages and helpers before the browser run. Explicit adapters remove rendering assertions and an unmodified native alias from mixed pages. Known failures have explicit reasons in the expectations file and remain failures in the summary.

The additional matching failures include 184 attribute-casing cases, one `:lang()` case involving a subtag longer than eight characters, and five shadow-state or host cases. Five more failures concern tentative switch controls. Chromium 151 does not expose the switch state required by that page, so those failures include a host limitation. The checked-and-indeterminate case, autofill parsing, and the outer-tree `::slotted()` matching case pass.

Some WPT inputs describe tentative or draft features. Their acceptance expectations do not establish Chrome 153 support. The native-browser comparison and WPT validity results answer different questions and remain separate.

The separate arbitrary-input fuzzer also found a parser stall on malformed text. A native stack sample showed regular-expression matching, and the debugger paused inside `parse()`. The same input exceeded a 3000ms subprocess limit in both the pre-change `6b87731` build and the current build. The [recorded input and outcomes](../../../assets/repo/bench/parser-stall.json) preserve the case. This is an unresolved parser performance gap. The full randomized fuzz run was stopped after capture and is not reported as passing. Fix this path with a bounded tokenizer or equivalent validation before adding the input to ordinary replay tests.

## Unicode directionality and identifiers

The server-DOM `:dir()` fallback needs a Unicode update and a directionality algorithm correction. Its current regular expression requires the whole text to fall within a small set of right-to-left ranges. A forced-fallback probe misclassified Hebrew followed by Latin text, Hebrew after leading punctuation, Adlam, and Unicode 17 Sidetic characters. Enlarging that expression alone would still miss the first-strong-character behavior required for automatic direction.

Use [`@unicode/unicode-17.0.0`](https://github.com/node-unicode/unicode-17.0.0) as a development input for compact generated direction tables. Its documentation recommends build-time use. The package supplies character properties, while the engine must implement the HTML directionality rules and their DOM context. This audit has not added the dependency or changed the fallback. Browser-native direction checks still use the host browser's implementation.

Generate only the `Bidi_Class` data needed to distinguish left-to-right, right-to-left, and Arabic strong characters. Keep the tables in generated source and avoid a runtime dependency on the full data package. Record the Unicode version and verify range boundaries against the input data.

The fallback must then follow the [HTML directionality algorithm](https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute): inspect Unicode code points in order, respect explicit and inherited direction, and handle automatic direction and its element-specific rules. Tests should force the fallback and cover neutral prefixes, mixed scripts, supplementary characters, isolated descendants, input and textarea values, and later DOM changes. Native browser agreement alone cannot verify a server fallback that delegates to the browser during the test.

Selector identifiers need a separate review against [CSS Syntax](https://drafts.csswg.org/css-syntax/#ident-start-code-point). CSS identifier rules are not Unicode's `ID_Start` rules. Literal and escaped supplementary characters already work in the tested identifiers, including new Unicode 17 characters. The latest CSS draft restricts some code points that the current broad non-ASCII pattern accepts. Compare those boundaries with the target browser before changing the grammar.

## API and execution tradeoffs

The `nwsapi` core exposes compiler, configuration, extension registration, direct lookup, and installation methods beyond its DOM queries. Its adapter provides the same main query and analysis method names as the comparison class. See the [API reference](api.md). More public methods do not imply broader CSS support.

`@asamuzakjp/dom-selector` uses `css-tree` for parsing and has an AST execution fallback. In a separate enforced-CSP probe, its compound, `:has()`, and positional queries worked when `Function()` was blocked. The corresponding core queries threw `EvalError`, while simple class lookup still worked. This is a separate execution constraint. No interpreter fallback was added by these changes.

The adapters also return different ASTs for `check('p, #missing')` against a paragraph. The core adapter keeps the matching branch, while the comparison class returns the selector list. This observation does not establish a consumer specificity bug. Stylesheet matching needs tests for the consumer's expected AST and pseudo-element contract.

## Reproduce the comparison

Build the current source, then supply the intended browser executable and a local checkout of the comparison library:

```sh
pnpm run build
node scripts/repo/bench/selector-compatibility.mts \
  --browser '/path/to/Chrome for Testing' \
  --expect-major 153 \
  --competitor ../domSelector
```

The script reads the [tracked fixtures](../../../test/repo/fixtures/selectors/compatibility.json), bundles the local comparison source with the installed dependencies, and records their versions. The fixture page uses intercepted requests and needs no live site. The report includes repository revisions and hashes of the inputs and executed bundles. Bundle hashes identify uncommitted builds more precisely than the recorded `HEAD` alone.

Run the audit after builds and tests that regenerate JavaScript have finished. Do not run it while those files are being rewritten. Generated observations belong in `assets/repo/bench/`. Full CPU profiles belong in a temporary directory, as described in the performance journal.
