/*
 * Curated list of upstream WPT files to run against src/nwsapi.js.
 * Paths are root-absolute within the upstream/wpt checkout (pinned @ 7aed663).
 *
 * Hand-picked Selectors API tests and adapted selector-validity inputs.
 * Programmatic focus/state tests may depend on browser rendering, but assert
 * through DOM APIs. Parsing adapters exclude CSSOM serialization and rendering
 * assertions. Screenshot comparisons and testdriver automation are excluded.
 *
 * Enumerated but deliberately excluded:
 * - /dom/nodes/Element-webkitMatchesSelector.html — exercises the
 *   webkitMatchesSelector alias, which NW.Dom.install() does not override,
 *   so it would only ever test the native engine.
 * - /css/selectors/open-pseudo.html — asserts getComputedStyle() results and
 *   drives a <select> picker via test_driver.click(); not DOM-only.
 * - /css/selectors/selectors-4/details-open-pseudo-001/002/003.html —
 *   reftests (<link rel="match">); they need screenshot comparison.
 * - /css/selectors/invalidation/open-pseudo-class-in-has.html — style
 *   invalidation test built on getComputedStyle().
 * - /css/selectors/attribute-selectors/style-attribute-selector.html and
 *   attribute-case/{semantics,syntax,value-case-sensitivity-svg}.html —
 *   assert via getComputedStyle() (and testdriver in places); not DOM-only.
 * - /css/selectors/attribute-selectors/attribute-case/cssom.html and
 *   /css/selectors/nth-child-large-anplusb-clamp.html — pure CSSOM
 *   selectorText serialization; they never call the Selectors API, so they
 *   would only ever test the native CSS parser, not nwsapi.
 * - /css/selectors/selectors-case-sensitive-001.html — asserts offsetHeight
 *   (rendering-dependent).
 * - /css/selectors/*crash*.html, *-ref.html, *-manual.html — crashtests,
 *   reftest references and manual tests; no testharness.js results to read.
 * - Focus tests requiring testdriver remain excluded; programmatic focus
 *   and state-preserving move tests below run without testdriver.
 */
export const manifest: Array<{
  path: string
  note: string
  install?: boolean
  legacyMap?: boolean
  parsing?: boolean
  selectorInputs?: number
}> = [
  ...[
    '/css/css-overflow/parsing/scroll-buttons-invalid.html',
    '/css/css-overflow/parsing/scroll-buttons-valid.html',
    '/css/css-pseudo/parsing/highlight-pseudos-search-text.tentative.html',
    '/css/css-pseudo/parsing/highlight-pseudos.html',
    '/css/css-pseudo/parsing/tree-abiding-pseudo-elements.html',
    '/css/css-shadow/host-context-parsing.html',
    '/css/css-shadow/host-parsing.html',
    '/css/css-shadow/part/pseudo-classes-after-part.html',
    '/css/css-shadow/slotted-parsing.html',
    '/css/css-view-transitions/parsing/pseudo-elements-invalid-with-classes.html',
    '/css/css-view-transitions/parsing/pseudo-elements-invalid.html',
    '/css/css-view-transitions/parsing/pseudo-elements-valid-with-classes.html',
    '/css/css-view-transitions/parsing/pseudo-elements-valid.html',
  ].map(path => ({
    path,
    note: 'Upstream validity inputs adapted to installed selector APIs. CSSOM serialization is excluded.',
    parsing: true,
  })),
  {
    path: '/css/css-shadow/part/pseudo-elements-after-part.html',
    note: 'Only the 23 top-level selector validity inputs run. Rendering assertions are excluded.',
    parsing: true,
    selectorInputs: 23,
  },
  ...[
    'invalid-pseudos',
    'parse-anplusb',
    'parse-attribute',
    'parse-child',
    'parse-class',
    'parse-descendant',
    'parse-focus-visible',
    'parse-has-disallow-nesting-has-inside-has',
    'parse-has-forgiving-selector',
    'parse-has-slotted.tentative',
    'parse-has',
    'parse-heading',
    'parse-id',
    'parse-is-where',
    'parse-is',
    'parse-not',
    'parse-part',
    'parse-sibling',
    'parse-slotted',
    'parse-state',
    'parse-universal',
    'parse-where',
  ].map(name => ({
    path: `/css/selectors/parsing/${name}.html`,
    note: 'Upstream validity inputs adapted to installed selector APIs. CSSOM serialization is excluded.',
    parsing: true,
  })),
  {
    path: '/html/semantics/selectors/pseudo-classes/checked.html',
    note: 'HTML selector semantics: checked through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/default.html',
    note: 'HTML selector semantics: default through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/dir-dynamic.html',
    note: 'HTML selector semantics: dir-dynamic through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/dir-html-input-dynamic-text.html',
    note: 'HTML selector semantics: dir-html-input-dynamic-text through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/dir.html',
    note: 'HTML selector semantics: dir through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/dir01.html',
    note: 'HTML selector semantics: dir01 through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/disabled.html',
    note: 'HTML selector semantics: disabled through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/enabled.html',
    note: 'HTML selector semantics: enabled through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/focus-autofocus.html',
    note: 'HTML selector semantics: focus-autofocus through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/focus.html',
    note: 'HTML selector semantics: focus through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/indeterminate.html',
    note: 'HTML selector semantics: indeterminate through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/inrange-outofrange-time-reversed.html',
    note: 'HTML selector semantics: inrange-outofrange-time-reversed through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/inrange-outofrange.html',
    note: 'HTML selector semantics: inrange-outofrange through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/link.html',
    note: 'HTML selector semantics: link through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/readwrite-readonly.html',
    note: 'HTML selector semantics: readwrite-readonly through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/required-optional.html',
    note: 'HTML selector semantics: required-optional through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/valid-invalid-fieldset-disconnected.html',
    note: 'HTML selector semantics: valid-invalid-fieldset-disconnected through DOM APIs',
  },
  {
    path: '/html/semantics/selectors/pseudo-classes/valid-invalid.html',
    note: 'HTML selector semantics: valid-invalid through DOM APIs',
  },

  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/nodelist-contract.html',
    note: 'local WPT regression: static NodeList indexing, iteration and mutation across four contexts',
  },
  {
    path: '/css/selectors/dir-pseudo-on-input-element.html',
    note: 'input directionality across types, values and live type changes',
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/media-time-state.html',
    note: 'local WPT regression: native and reflected media states and host timelines',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/descendant-routing.html',
    note: 'local WPT regression: descendant routes, external ancestors, wide levels, and live mutations',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/ancestor-filter.html',
    note: 'local WPT regression: adaptive ancestor filters, mutations, exceptions, and legacy mode',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/compound-negation.html',
    note: 'local WPT regression: compound and general negation paths with modern and legacy hosts',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/hover-tracking.html',
    note: 'local WPT regression: lazy hover tracking and cross-document event isolation',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/property-reads.html',
    note: 'local WPT regression: reflected classes, SVG base values, attribute fallbacks, and escaped IDs',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/attribute-equality.html',
    note: 'local WPT regression: exact attribute values, escapes, case rules, and custom operators',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/plan-cache.html',
    note: 'local WPT regression: context-free plans, escaped tokens, callbacks, and DOM mutation',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/wrapper-arguments.html',
    note: 'local WPT regression: installed wrapper arities and callbacks',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/resolver-execution.html',
    note: 'local WPT regression: resolver loops, callback cache separation, and cached candidate lookup',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/nth-constant.html',
    note: 'local WPT regression: constant sibling indexes agree with native queries after mutation',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/structural-selectors.html',
    note: 'DOM API adaptations of upstream filtered-position and namespace rendering fixtures',
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/legacy-dom.html',
    note: 'local WPT regression: legacy host reads agree with native selectors and refresh after mutations',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/cache-generations.html',
    note: 'local WPT regression: cache promotion, eviction, updates, and capacity',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/cache-legacy.html',
    note: 'local WPT regression: cache fallback without Map',
    install: false,
    legacyMap: true,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/has-anchor-isolation.html',
    note: 'local WPT regression: private anchor syntax is rejected without rejecting quoted values',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/identifier-escapes.html',
    note: 'local WPT regression: escaped identifiers agree with native matching and selection after mutation',
    install: false,
  },
  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/matcher-cache.html',
    note: 'local regression using the upstream WPT harness: host matcher replacement, recursion, legacy configuration, and document switching',
    install: false,
  },
  {
    path: '/dom/nodes/ParentNode-querySelector-All.html',
    note: 'main Selectors-API suite: invalid/valid selectors from selectors.js across document/element/fragment/detached contexts',
  },
  {
    path: '/dom/nodes/ParentNode-querySelector-scope.html',
    note: ':scope in querySelector/querySelectorAll',
  },
  {
    path: '/dom/nodes/ParentNode-querySelector-escapes.html',
    note: 'CSS escape sequences in selectors',
  },
  {
    path: '/dom/nodes/ParentNode-querySelector-case-insensitive.html',
    note: '[attr=value i] case-insensitive attribute matching',
  },
  {
    path: '/dom/nodes/querySelector-mixed-case.html',
    note: 'mixed-case attribute names',
  },
  {
    path: '/dom/nodes/ParentNode-querySelectors-namespaces.html',
    note: 'namespace attribute selectors on SVG (xlink:href)',
  },
  {
    path: '/dom/nodes/ParentNode-querySelectors-exclusive.html',
    note: 'querySelector(All) must not include the context element itself',
  },
  {
    path: '/dom/nodes/ParentNode-querySelectors-space-and-dash-attribute-value.html',
    note: 'attribute values containing spaces and dashes',
  },
  {
    path: '/dom/nodes/svg-template-querySelector.html',
    note: 'querySelector inside <template> fragments containing SVG',
  },
  {
    path: '/dom/nodes/DocumentFragment-querySelectorAll-after-modification.html',
    note: 'querySelectorAll on a DocumentFragment after it is modified',
  },
  {
    path: '/dom/nodes/ParentNode-querySelectorAll-removed-elements.html',
    note: 'removed elements must not be returned',
  },
  {
    path: '/dom/nodes/query-target-in-load-event.html',
    note: ':target queried from the window load event (in iframe)',
  },
  {
    path: '/css/selectors/dir-selector-querySelector.html',
    note: ':dir() pseudo-class via querySelectorAll; DOM-only',
  },
  {
    path: '/dom/nodes/Element-matches.html',
    note: 'full selectors.js suite driven through Element.matches()',
  },
  {
    path: '/dom/nodes/Element-matches-namespaced-elements.html',
    note: 'matches() on createElementNS elements (jsdom regressions); the webkitMatchesSelector half runs the native engine (alias not overridden by install())',
  },
  {
    path: '/dom/nodes/Element-closest.html',
    note: 'Element.closest() walking up through forms/fieldsets/options',
  },
  {
    path: '/dom/nodes/ParentNode-querySelector-All-xht.xht',
    note: 'XHTML (application/xhtml+xml) variant of the main Selectors-API suite',
  },
  {
    path: '/css/selectors/child-indexed-pseudo-class.html',
    note: ':first-child/:last-child/:only-child/:nth-* matching via matches()',
  },
  {
    path: '/css/selectors/child-indexed-during-parse.html',
    note: 'child-indexed pseudo-classes evaluated while the parent is still being parsed',
  },
  {
    path: '/css/selectors/first-child.html',
    note: ':first-child with whitespace/comment/text siblings',
  },
  {
    path: '/css/selectors/first-of-type.html',
    note: ':first-of-type incl. namespaced and mixed-case type siblings',
  },
  {
    path: '/css/selectors/last-child.html',
    note: ':last-child with whitespace/comment/text siblings',
  },
  {
    path: '/css/selectors/last-of-type.html',
    note: ':last-of-type incl. namespaced and mixed-case type siblings',
  },
  {
    path: '/css/selectors/only-child.html',
    note: ':only-child with non-element siblings',
  },
  {
    path: '/css/selectors/only-of-type.html',
    note: ':only-of-type incl. namespaced and mixed-case type siblings',
  },
  {
    path: '/css/selectors/is-where-basic.html',
    note: 'basic :is()/:where() matching via querySelectorAll',
  },
  {
    path: '/css/selectors/query/query-is.html',
    note: 'upstream query assertions for simple, compound, complex, and nested :is() arguments',
  },
  {
    path: '/css/selectors/query/query-where.html',
    note: 'upstream query assertions for simple, compound, complex, and nested :where() arguments',
  },
  {
    path: '/css/selectors/is-where-not.html',
    note: ':not() containing :is()/:where()',
  },
  {
    path: '/css/selectors/not-complex.html',
    note: ':not() with complex (combinator) arguments',
  },
  {
    path: '/css/selectors/missing-right-token.html',
    note: 'attribute selectors with unclosed brackets/quotes must still match',
  },
  {
    path: '/css/selectors/scope-selector.html',
    note: ':scope against ShadowRoot/DocumentFragment/document contexts',
  },
  {
    path: '/css/selectors/has-basic.html',
    note: 'basic :has() matching via querySelectorAll/matches/closest',
  },
  {
    path: '/css/selectors/has-relative-argument.html',
    note: ':has() with relative selector arguments (>, +, ~ at start)',
  },
  {
    path: '/css/selectors/has-argument-with-explicit-scope.html',
    note: ':has() arguments containing explicit :scope',
  },
  {
    path: '/css/selectors/has-matches-to-uninserted-elements.html',
    note: ':has() on detached subtrees',
  },
  {
    path: '/css/selectors/heading.html',
    note: ':heading and :heading() pseudo-classes (Selectors 5)',
  },
  {
    path: '/css/selectors/heading-prefixed.html',
    note: ':heading with prefixed selector lists (Selectors 5)',
  },
  {
    path: '/css/selectors/pseudo-enabled-disabled.html',
    note: ':enabled/:disabled across form controls',
  },
  {
    path: '/css/selectors/selector-placeholder-shown-emptify-placeholder.html',
    note: ':placeholder-shown after clearing the placeholder attribute',
  },
  {
    path: '/css/selectors/selector-after-font-family.html',
    note: ':empty stays parseable after a font-family using the same name',
  },
  {
    path: '/css/selectors/dir-selector-auto.html',
    note: ':dir() with dir=auto direction resolution',
  },
  {
    path: '/css/selectors/dir-pseudo-on-bdi-element.html',
    note: ':dir() on <bdi> elements',
  },
  {
    path: '/css/selectors/focus-in-focus-event-001.html',
    note: 'focus state during focus callbacks',
  },
  {
    path: '/css/selectors/focus-in-focusin-event-001.html',
    note: 'focus state during focusin callbacks',
  },
  {
    path: '/css/selectors/focus-display-none-001.html',
    note: 'focus state after hiding focused controls',
  },
  {
    path: '/css/selectors/focus-within-display-none-001.html',
    note: 'focus-within after display changes',
  },
  {
    path: '/css/selectors/focus-within-focus-move.html',
    note: 'reentrant focus moves update ancestor state',
  },
  {
    path: '/css/selectors/focus-within-removal.html',
    note: 'focus callbacks removing an ancestor',
  },
  {
    path: '/css/selectors/focus-within-toplayer-001.html',
    note: 'focus-within through top-layer elements',
  },
  {
    path: '/css/selectors/i18n/lang-pseudo-class-disconnected.html',
    note: 'language inheritance in disconnected subtrees',
  },
  {
    path: '/dom/nodes/moveBefore/moveBefore-lang.html',
    note: 'language inheritance after state-preserving moves',
  },
  {
    path: '/dom/nodes/moveBefore/moveBefore-dir.html',
    note: 'direction inheritance after state-preserving moves',
  },
  {
    path: '/dom/nodes/moveBefore/focus-within.html',
    note: 'focus-within after state-preserving moves',
  },
  {
    path: '/dom/nodes/moveBefore/modal-dialog.html',
    note: 'modal selector state after state-preserving moves',
  },
  {
    path: '/dom/nodes/moveBefore/popover-preserve.html',
    note: 'popover selector state after state-preserving moves',
  },
]
