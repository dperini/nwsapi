/*
 * Curated list of upstream WPT files to run against src/nwsapi.js.
 * Paths are root-absolute within the upstream/wpt checkout (pinned @ 7aed663).
 *
 * Hand-picked DOM-only tests: everything here drives querySelector /
 * querySelectorAll / matches purely through the DOM, with no dependency on
 * rendering, getComputedStyle, or testdriver automation.
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
 * - /css/selectors/focus-… hover-… active-… and friends — need real user
 *   interaction (testdriver) or rendering state.
 */
export const manifest = [
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
    note: ':heading and :heading() pseudo-classes (Selectors 5; unsupported by nwsapi, kept as expected-fail canary)',
  },
  {
    path: '/css/selectors/heading-prefixed.html',
    note: ':heading with prefixed selector lists (Selectors 5; unsupported by nwsapi, kept as expected-fail canary)',
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
];
