import type { WptEntry } from './manifest.mts'

// Reviewed additions from the full pinned WPT tree. Every retained test
// exercises selector parsing or matching, including dynamic DOM state.
export const additionalSelectors: WptEntry[] = [
  {
    path: '/inert/inert-does-not-match-disabled-selector.html',
    domOnly: 'inert',
    note: 'Retain the disabled-state assertion. Remove an unused computed-color read.',
  },
  {
    path: '/html/semantics/popovers/popover-move-documents.html',
    selectorTests: {
      total: 3,
      names: [
        'Moving popovers between documents while hiding should not throw an exception.',
        'Moving popovers between documents during light dismiss should throw an exception.',
      ],
    },
    note: 'Retain popover-state assertions during adoption. Exclude the exception-only test.',
  },
  {
    path: '/html/semantics/popovers/togglePopover.html',
    selectorTests: {
      total: 3,
      names: [
        'togglePopover should toggle the popover and return true or false as specified.',
        "togglePopover's return value should reflect what the end state is, not just the force parameter.",
      ],
    },
    note: 'Retain selector state checks after toggles and canceled transitions.',
  },
  {
    path: '/css/css-conditional/js/CSS-supports-details-content-pseudo-parsing.html',
    parsing: true,
    supportsInputs: 8,
    note: 'Eight selector grammar assertions adapted from support conditions. CSSOM support detection is not tested.',
  },
  {
    path: '/css/css-conditional/js/CSS-supports-selector-picker.html',
    parsing: true,
    supportsInputs: 6,
    note: 'Six selector grammar assertions adapted from support conditions.',
  },
  ...[
    '/html/browsers/browsing-the-web/scroll-to-fragid/target-pseudo-after-reinsertion.html',
    '/html/semantics/popovers/popover-active-document.html',
    '/html/semantics/popovers/popover-removal.html',
    '/html/semantics/popovers/popover-removal-2.html',
    '/fullscreen/rendering/fullscreen-pseudo-class-support.html',
    '/html/dom/elements/global-attributes/cdata-dir_auto.html',
    '/html/dom/elements/global-attributes/lang-attribute-document-element-replacement.html',
    '/html/semantics/forms/constraints/input-number-validity-dynamic-value-no-change.html',
    '/html/semantics/forms/constraints/input-pattern-dynamic-value.html',
    '/html/semantics/forms/the-input-element/focus-dynamic-type-change.html',
    '/html/semantics/forms/the-input-element/pattern_attribute.html',
    '/html/semantics/forms/the-input-element/pattern_attribute_v_flag.html',
    '/html/semantics/forms/the-input-element/time-focus-dynamic-value-change.html',
    '/html/semantics/forms/the-output-element/output-validity.html',
    '/html/semantics/forms/the-select-element/customizable-select/option-disabled-invalid-nesting.html',
    '/html/semantics/sections/headingoffset-and-headingreset.html',
    '/html/semantics/sections/headingoffset-mutations.html',
    '/quirks/classname-query-after-sibling-adoption.html',
    '/shadow-dom/focus/focus-pseudo-matches-on-shadow-host.html',
    '/shadow-dom/leaktests/get-elements.html',
    '/shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/selectors-api-001.html',
    '/shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/selectors-api-002.html',
    '/shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/test-009.html',
  ].map(path => ({
    path,
    note: 'Upstream selector assertions. No rendering results are consumed.',
  })),
  ...[
    '/custom-elements/registries/pseudo-class-defined.window.html',
    '/html/dom/elements/global-attributes/dir-assorted.window.html',
    '/html/dom/elements/global-attributes/dir-auto-form-associated.window.html',
    '/html/dom/elements/global-attributes/lang-attribute-shadow.window.html',
    '/html/dom/elements/global-attributes/lang-attribute.window.html',
  ].map(path => ({
    path,
    script: true,
    note: 'Upstream selector matching through a window-script wrapper.',
  })),
  ...[
    '/custom-elements/pseudo-class-defined-customized-builtins.html',
    '/custom-elements/pseudo-class-defined.html',
  ].map(path => ({
    path,
    domOnly: 'defined' as const,
    note: 'Retain defined-state matching before, during, and after upgrades. Remove computed-color assertions.',
  })),
  {
    path: '/html/dom/elements/global-attributes/dir-auto-dynamic-changes.window.html',
    script: true,
    scriptDependencies: ['dir-shadow-utils.js'],
    domOnly: 'dynamic-direction',
    note: 'Retain direction matching after text, slot, and ancestor mutations. Remove two computed-direction assertions.',
  },
  {
    path: '/custom-elements/state/state-pseudo-class.html',
    selectorTests: {
      total: 8,
      names: [
        ':state() parsing passes',
        ':state() parsing failures',
        'deprecated :--state parsing failures',
        ':state(foo) in simple cases',
        ':state(foo) and other pseudo classes',
      ],
    },
    note: 'Retain five selector parsing and matching tests. Exclude serialization and computed-style tests.',
  },
  {
    path: '/custom-elements/form-associated/form-disabled-callback.html',
    selectorTests: {
      total: 10,
      names: [
        'Adding/removing disabled content attribute',
        'Relationship with FIELDSET',
      ],
    },
    note: 'Retain enabled and disabled selector assertions during attribute and ancestor changes.',
  },
  {
    path: '/custom-elements/form-associated/ElementInternals-validation.html',
    selectorTests: {
      total: 14,
      names: ['Custom control affects :valid :invalid for FORM and FIELDSET'],
    },
    note: 'Retain validity selector assertions for custom controls, forms, and fieldsets.',
  },
  {
    path: '/html/semantics/forms/the-select-element/customizable-select/option-disabled-optgroup-wrapper.html',
    selectorTests: {
      total: 3,
      names: [
        ':disabled matches option in wrapper inside disabled optgroup',
        ':disabled updates dynamically when optgroup disabled changes with wrapper',
      ],
    },
    note: 'Retain disabled selector assertions through wrappers. Exclude native selectedness testing.',
  },
]
