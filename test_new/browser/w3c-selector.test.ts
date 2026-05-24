// import { expect } from '@playwright/test';
import { runScenarios } from './harness/scenarios';

runScenarios('w3c - selector', 'normal', [
  {
    name: ':root selector contexts',
    markup: `<div id="foo"><span id="bar"></span></div>`,
    cases: [
      { select: ':root', expect: { count: 1 } },
      { select: ':root', ref: { by: 'id', id: 'foo' }, expect: { count: 0 } },
      { select: ':root', ref: { by: 'id', id: 'foo', home: 'detached' }, expect: { count: 0 } },
      { select: ':root', ref: { by: 'id', id: 'foo', home: 'fragment' }, expect: { count: 0 } },

      { select: ':root span', ref: { by: 'id', id: 'foo' }, expect: { count: 1 } },
      { select: ':root span', ref: { by: 'id', id: 'foo', home: 'detached' }, expect: { count: 0 } },
      { select: ':root span', ref: { by: 'id', id: 'foo', home: 'fragment' }, expect: { count: 0 } },

      { closest: ':root > *', ref: { by: 'id', id: 'foo', home: 'detached' }, expect: { count: 0 } },
    ],
  },
]);
