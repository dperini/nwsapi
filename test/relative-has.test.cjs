'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');
const markup = '<!doctype html><body><main id="scope"><div id="a"><i id="i" class="a"><b id="b" class="b"></b></i></div><div id="c"><p id="p"></p></div><div id="d"></div></main><aside id="outside"><p></p></aside>';
const selectors = [
  'div:has(p)', 'div:has(> p)', 'div:has(+ div)', 'div:has(~ div)',
  'div:has(+ .missing)', 'div:has(~ .missing)',
  'div:has(+ div p)', 'div:has(~ div p)', 'div:has(~ aside)',
  'div:has(.missing, p)', 'div:has(.missing, + div p)',
  'div:has(+ .missing, ~ div)', 'div:has(p, + div)',
  'div:has(:scope)', 'div:has(:scope p)', 'div:has(> :scope)',
  'main:has(:scope > div)', 'main:has(div :scope)',
  'div:has(:is(.a .b))', 'html:has(+ div)', 'html:has(~ div)',
  'div:has(> p):has(+ div)', 'div:has(+ div):not(:has(p))'
];

function fixture(t) {
  const { window } = new JSDOM(markup);
  t.after(() => window.close());
  return { document: window.document, nw: factory(window) };
}

test('relative selectors retain the anchor', t => {
  const { document, nw } = fixture(t);
  for (const [selector, expected] of [
    ['div:has(+ .missing)', []], ['div:has(~ .missing)', []],
    ['div:has(+ div p)', ['a']], ['div:has(~ div p)', ['a']],
    ['div:has(.missing, + div p)', ['a']], ['div:has(p, + div)', ['a', 'c']],
    ['div:has(> p)', ['c']], ['div:has(:is(.a .b))', ['a']],
    ['html:has(+ div)', []], ['html:has(~ div)', []],
    ['div:has(:scope)', []], ['div:has(:scope p)', []]
  ]) {
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(nw.select(selector, document).map(e => e.id), expected, selector);
      for (const id of ['a', 'c', 'd']) {
        assert.equal(nw.match(selector, document.getElementById(id)), expected.includes(id), selector + ' ' + id);
      }
    }
  }
});

test('anchor restoration after success and exceptions', t => {
  const { document, nw } = fixture(t);
  const previous = document.getElementById('d');
  nw.Snapshot.anchor = previous;
  assert.deepEqual(nw.select('div:has(p)', document).map(e => e.id), ['c']);
  assert.equal(nw.Snapshot.anchor, previous);
  for (const selector of ['div:has(p, :unknown)', 'html:has(+ :unknown)', 'div:has(, p)']) {
    assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' }, selector);
    assert.equal(nw.Snapshot.anchor, previous);
  }
});

for (const selector of ['div:has(:has(p))', 'div:has(::before)']) {
  test('reject ' + selector, { todo: 'Inherited :has argument-validation gap; must be resolved before merge' }, t => {
    const { document, nw } = fixture(t);
    assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' });
  });
}

test('Chromium agreement for document, scoped, and detached queries', { skip: !process.env.NWSAPI_BROWSER }, async () => {
  const { chromium } = require('@playwright/test');
  const { readFileSync } = require('node:fs');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(markup);
    await page.addScriptTag({ content: readFileSync(require.resolve('../src/nwsapi.js'), 'utf8') });
    for (const selector of selectors) {
      for (const shape of ['document', 'scoped', 'detached']) {
        const result = await page.evaluate(({ selector, shape }) => {
          const context = shape === 'document' ? document : shape === 'scoped' ?
            document.getElementById('scope') : document.getElementById('scope').cloneNode(true);
          return {
            native: Array.from(context.querySelectorAll(selector), e => e.id),
            nwsapi: NW.Dom.select(selector, context).map(e => e.id)
          };
        }, { selector, shape });
        assert.deepEqual(result.nwsapi, result.native, selector + ' ' + shape);
      }
    }
  } finally { await browser.close(); }
});
