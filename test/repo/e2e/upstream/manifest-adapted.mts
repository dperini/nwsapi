import type { WptEntry } from './manifest.mts'
export const entries: WptEntry[] = [
  {
    path: '/dom/nodes/NodeList-Iterable.html',
    note: 'Seven checks of querySelectorAll result iteration and enumeration. The unrelated live childNodes test is excluded.',
    domOnly: 'selector-lists',
  },

  {
    path: '/css/selectors/webkit-pseudo-element.html',
    note: 'Four selector API tests retain their original assertions. Two stylesheet tests and one CSSOM assertion are excluded.',
    domOnly: 'webkit-pseudos',
  },

  {
    path: '/css/css-shadow/has-slotted-query-selector.html',
    note: 'Slot assignment, replacement, and flattened assignment through selector APIs. Four computed-style assertions are excluded.',
    domOnly: 'slot-assignment',
  },

  {
    path: '/css/css-highlight-api/custom-highlight-universal-parsing-and-computed-style.tentative.html',
    note: 'Eight selector validity inputs run. Computed-style assertions are excluded.',
    parsing: true,
    selectorInputs: 8,
  },

  {
    path: '/css/css-shadow/part/pseudo-elements-after-part.html',
    note: 'Only the 23 top-level selector validity inputs run. Rendering assertions are excluded.',
    parsing: true,
    selectorInputs: 23,
  },

  {
    path: '/html/semantics/selectors/pseudo-classes/valid-invalid.html',
    note: 'HTML selector semantics: valid-invalid through DOM APIs',
    domOnly: 'form-validity',
  },

  {
    path: '/css/selectors/dir-pseudo-on-input-element.html',
    note: 'input directionality across types, values and live type changes',
    domOnly: 'input-direction',
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
    path: '/dom/nodes/Element-matches-namespaced-elements.html',
    note: 'matches() on createElementNS elements. The native-only alias variants are excluded.',
    domOnly: 'namespace-matches',
  },
]
