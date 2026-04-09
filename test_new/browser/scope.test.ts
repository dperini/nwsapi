import { runScenarios } from "./harness/scenarios";

runScenarios('scope', 'normal', [
  {
    name: 'scope-01a',
    html: `
      <ul>
        <li id="scope"><a>abc</a></li>
        <li>def</li>
        <li><a>efg</a></li>
      </ul>
    `,
    cases: [
      { select: 'ul a', expect: { count: 2 } },
      { select: '#scope', expect: { count: 1 } },
      { select: 'a', scope: { by: 'id', id: 'scope' }, expect: { count: 1 } },
    ],
  },

  {
    name: 'scope-01b',
    html: `
      <ul>
        <li id="scope"><a>abc</a></li>
        <li>def</li>
        <li><a>efg</a></li>
      </ul>
    `,
    cases: [
      { select: '#scope', expect: { count: 1 } },
      { select: ':scope ul a', scope: { by: 'id', id: 'scope' }, expect: { count: 0, ids: [] } },
      { select: ':scope body ul a', scope: { by: 'id', id: 'scope' }, expect: { count: 0, ids: [] } },
      { select: ':scope a', scope: { by: 'id', id: 'scope' }, expect: { count: 1 } },
    ],
  },

  {
    name: 'scope-02a/02b',
    html: `
      <div class="a">
        <div class="a1"></div>
        <div class="a2"></div>
      </div>
    `,
    cases: [
      { select: '.a', expect: { count: 1 } },
      { select: 'body div', scope: { by: 'first', selector: '.a' }, expect: { count: 2 } },
      { select: ':scope body div', scope: { by: 'first', selector: '.a' }, expect: { count: 0, ids: [] } },
    ],
  },

  {
    name: 'scope-03a',
    html: `
      <div class="block">
        <p class="para">
          <span class="inline">hello</span>
        </p>
      </div>
    `,
    cases: [
      { select: 'div', expect: { count: 1 } },
      { select: ':scope > p', scope: { by: 'first', selector: 'div' }, expect: { count: 1 } },
      { select: ':scope > span', scope: { by: 'first', selector: 'div' }, expect: { count: 0, ids: [] } },
    ],
  },

  {
    name: 'scope-03b',
    html: `
      <div class="a">
        <div class="a1"></div>
        <div class="a2"></div>
      </div>
    `,
    cases: [
      { select: 'body div', scope: { by: 'first', selector: '.a' }, expect: { count: 2 } },
      { select: ':scope body div', scope: { by: 'first', selector: '.a' }, expect: { count: 0, ids: [] } },
      { select: ':scope > .a1, :scope > .a2', scope: { by: 'first', selector: '.a' }, expect: { count: 2 } },
    ],
  },

  {
    name: 'scope-04a',
    status: 'fixme',
    htmlMode: 'document',
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>test nwsapi</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>@media (min-width:768px){.md\\:p-4{padding:1rem;}}</style>
        </head>
        <body class="md:p-4">
          <div data-test="foo"></div>
        </body>
      </html>
    `,
    cases: [
      { select: ':scope > [data-test="foo"]', scope: { by: 'first', selector: 'body' }, expect: { count: 1 } },
    ],
  },

  {
    name: 'scope-04b',
    status: 'fixme',
    html: `
      <div>
        <div class="outer">
          <div class="inner"></div>
        </div>
        <div class="other-outer"></div>
      </div>
    `,
    cases: [
      {
        select: ':scope > div',
        scope: { by: 'first', selector: 'div' },
        expect: {
          classes: ['outer', 'other-outer']
        },
      },
    ],
  },

]);