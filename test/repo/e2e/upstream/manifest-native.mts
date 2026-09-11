import type { WptEntry } from './manifest.mts'
export const entries: WptEntry[] = [
  {
    path: '/css/css-shadow/host-dom-001.html',
    note: 'Shadow host scoping through matches() and querySelector().',
  },

  {
    path: '/css/css-shadow/slotted-matches.html',
    note: 'Slotted pseudo-elements do not match elements outside the shadow tree.',
  },

  {
    path: '/css/css-shadow/has-slotted-manual-assignment.html',
    note: 'Draft slot state through selector APIs. Manual means programmatic slot assignment.',
  },

  {
    path: '/css/selectors/selectors-4/lang-singleton-subtag-matching.html',
    note: 'Language-range matching and singleton subtags through querySelectorAll().',
  },

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
    path: '/_repo/test/repo/e2e/upstream/fixtures/nodelist-contract.html',
    note: 'local WPT regression: static NodeList indexing, iteration and mutation across four contexts',
  },

  {
    path: '/_repo/test/repo/e2e/upstream/fixtures/structural-selectors.html',
    note: 'DOM API adaptations of upstream filtered-position and namespace rendering fixtures',
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
