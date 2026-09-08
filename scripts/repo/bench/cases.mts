// Keep the basic checks alongside queries from the existing page fixtures.
export const cases: Record<string, Record<string, string[]>> = {
  components: {
    identifiers: ['#in-150', '.card', 'button', 'button.primary'],
    attributes: [
      '[data-testid]',
      '[data-testid="btn-150"]',
      '[data-testid^="btn-"]',
      '[class~="primary"]',
    ],
    relationships: [
      'div button',
      'div > button',
      'label + input',
      'button ~ span',
    ],
    positional: [
      'div:first-child',
      'div:last-child',
      'div:nth-child(2n)',
      'div:nth-last-child(3)',
    ],
    logical: [
      'button:not(.missing)',
      ':is(button, input)',
      ':where(.card) > button',
      'div:has(> button)',
    ],
    forms: [
      'input:enabled',
      'input:optional',
      'input:read-write',
      'button:disabled',
    ],
    components: [
      '.card > button.primary',
      '.card:has(> input) > button',
      '.card > :is(button, input)',
      '.card input:not([disabled])',
    ],
  },
  documentation: {
    documentation: ['ul li a', 'dl dd a', 'table tr td', 'div.example > p > a'],
  },
  atomic: {
    atomic: [
      '.sidebar .menu .link',
      '.app .card .row a',
      '.content .card .badge',
      '.card > .list > .row > a',
    ],
  },
}
