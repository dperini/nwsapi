import { runScenarios } from "./harness";

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
      { selector: 'ul a', expect: { count: 2 } },
      { selector: '#scope', expect: { count: 1 } },
      { selector: 'a', root: { kind: 'id', value: 'scope' }, expect: { count: 1 } },
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
      { selector: '#scope', expect: { count: 1 } },
      { selector: ':scope ul a', root: { kind: 'id', value: 'scope' }, expect: { count: 0, ids: [] } },
      { selector: ':scope body ul a', root: { kind: 'id', value: 'scope' }, expect: { count: 0, ids: [] } },
      { selector: ':scope a', root: { kind: 'id', value: 'scope' }, expect: { count: 1 } },
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
      { selector: '.a', expect: { count: 1 } },
      { selector: 'body div', root: { kind: 'selector', value: '.a' }, expect: { count: 2 } },
      { selector: ':scope body div', root: { kind: 'selector', value: '.a' }, expect: { count: 0, ids: [] } },
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
      { selector: 'div', expect: { count: 1 } },
      { selector: ':scope > p', root: { kind: 'selector', value: 'div' }, expect: { count: 1 } },
      { selector: ':scope > span', root: { kind: 'selector', value: 'div' }, expect: { count: 0, ids: [] } },
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
      { selector: 'body div', root: { kind: 'selector', value: '.a' }, expect: { count: 2 } },
      { selector: ':scope body div', root: { kind: 'selector', value: '.a' }, expect: { count: 0, ids: [] } },
      { selector: ':scope > .a1, :scope > .a2', root: { kind: 'selector', value: '.a' }, expect: { count: 2 } },
    ],
  },

  {
    name: 'scope-04a',
    modifier: 'fixme',
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
      { selector: ':scope > [data-test="foo"]', root: { kind: 'selector', value: 'body' }, expect: { count: 1 } },
    ],
  },

  {
    name: 'scope-04b',
    modifier: 'fixme',
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
        selector: ':scope > div',
        root: { kind: 'selector', value: 'div' },
        expect: {
          classes: ['outer', 'other-outer']
        },
      },
    ],
  },

]);