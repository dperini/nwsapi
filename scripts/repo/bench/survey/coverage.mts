import { cases } from '../cases.mts'

// Keep the established comparison and add neighboring forms before tuning.
export const expandedCases = {
  components: {
    ...cases['components'],
    'type union coverage': [
      ':where(button, input)',
      ':is(input, button)',
      ':is(button, input, label)',
      ':is(button, button)',
      ':is(button, missing)',
      ':is(missing, absent)',
      '.card > :where(input, button)',
      '.missing > :is(button, input)',
      ':is(button, input):not(.missing)',
    ],
    'form coverage': [
      'input:read-only',
      'input:disabled',
      'button:enabled',
      'input:required',
      'input:placeholder-shown',
    ],
    'attribute coverage': [
      '[data-testid^="btn-"][data-testid$="0"]',
      '[data-testid="btn-150"][data-testid]',
      '.missing[data-testid^="btn-"]',
      'button[data-testid]:not([disabled])',
    ],
    'position coverage': [
      '.card > :nth-of-type(2n)',
      '.card > :nth-last-of-type(1)',
      '.card > :nth-child(2n of button, input)',
      '.card > :nth-last-child(1 of button, input)',
    ],
  },
  documentation: {
    ...cases['documentation'],
    'documentation coverage': [
      'ul li :is(a, code)',
      'dl dd :where(a, code)',
      'div.example :is(p, pre)',
      'table tr :is(td, th)',
    ],
  },
  atomic: {
    ...cases['atomic'],
    'ancestor coverage': [
      '.content .card .missing',
      '.missing .card .badge',
      '.app .row .link',
      '.sidebar .row .link',
      '.card :is(a, span)',
      '.card > .list > .row > :is(a, span)',
    ],
  },
}
