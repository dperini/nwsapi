import { entries as adaptedEntries } from './manifest-adapted.mts'
import { entries as nativeEntries } from './manifest-native.mts'
import { additionalSelectors } from './selection.mts'
/*
 * Curated list of upstream WPT files to run against dist/nwsapi.js.
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
export interface WptEntry {
  path: string
  note: string
  install?: boolean
  legacyMap?: boolean
  parsing?: boolean
  selectorInputs?: number
  supportsInputs?: number
  script?: boolean
  reflectSwitch?: boolean
  scriptDependencies?: string[]
  selectorTests?: { names: string[]; total: number }
  domOnly?:
    | 'inert'
    | 'defined'
    | 'dynamic-direction'
    | 'form-validity'
    | 'input-direction'
    | 'namespace-matches'
    | 'slot-assignment'
    | 'webkit-pseudos'
    | 'selector-lists'
}

export const manifest: WptEntry[] = [
  ...additionalSelectors,
  ...[
    '/css/css-highlight-api/highlight-pseudo-parsing.html',
    '/webvtt/api/cue-pseudo-parsing.html',
    '/css/css-multicol/parsing/column-pseudo-invalid.html',
    '/css/css-multicol/parsing/column-pseudo-valid.html',
    '/html/semantics/forms/the-select-element/customizable-select/select-picker-popover-open-invalid.tentative.html',
    '/css/css-forms/parsing/checkmark-pseudo-element.html',
    '/css/css-forms/parsing/picker-icon-pseudo-element.html',
    '/css/css-forms/parsing/picker-select-pseudo-element.html',
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
    '/html/semantics/selectors/pseudo-classes/autofill.html',
  ].map(path => ({
    path,
    note: 'Upstream validity inputs adapted to installed selector APIs. CSSOM serialization is excluded.',
    parsing: true,
  })),
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
  ...[
    '/html/semantics/selectors/case-sensitivity/values.window.html',
    '/html/semantics/selectors/pseudo-classes/checked-indeterminate.window.html',
    '/html/semantics/selectors/pseudo-classes/input-checkbox-switch.tentative.window.html',
  ].map(path => ({
    path,
    note: 'Upstream window script wrapped with testharness. Switch-control cases require draft host behavior.',
    script: true,
    reflectSwitch: path.endsWith(
      '/input-checkbox-switch.tentative.window.html',
    ),
  })),
  ...adaptedEntries,
  ...nativeEntries,
]
