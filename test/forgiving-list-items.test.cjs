'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');

const markup = '<!doctype html><body><div id="d" data-v="a,b"><p id="p" class="a,b">x</p></div><p id="q"></p>';
const cases = [
  ['p:is(svg|p, p)', ['p', 'q']],
  ['div:is(svg|div, #d)', ['d']],
  [':where(svg|p, p)', ['p', 'q']],
  [':is(svg|p)', []],
  ['p:is(:unknown, #p)', ['p']],
  ['p:is(#p, :unknown)', ['p']],
  ['p:is(:unknown, :is(#p, #q))', ['p', 'q']],
  ['p:where(:unknown, :not(#q))', ['p']],
  ['div:is(:unknown, [data-v="a,b"])', ['d']],
  ['div:where(:unknown, [data-v=\'a,b\'])', ['d']],
  ['p:is(:unknown, .a\\,b)', ['p']],
  ['div:not(:is(svg|div))', ['d']],
  ['div[data-v="a,b"], p:is(:unknown, #q)', ['d', 'q']],
  ['p:is(:unknown, #p), p:where(:unknown, #q)', ['p', 'q']],
  ['p:is(, #p,)', ['p']],
  ['p:is(:unknown)', []]
];

function fixture(t) {
  const { window } = new JSDOM(markup);
  t.after(() => window.close());
  return { document: window.document, nw: factory(window) };
}

for (const [selector, expected] of cases) {
  test(selector, t => {
    const { document, nw } = fixture(t);
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(nw.select(selector, document).map(e => e.id), expected);
      assert.equal(nw.first(selector, document)?.id, expected[0]);
      for (const id of ['d', 'p', 'q']) {
        assert.equal(nw.match(selector, document.getElementById(id)), expected.includes(id), id);
      }
    }
  });
}

test('changing FORGIVING invalidates cached match and select resolvers', t => {
  const { document, nw } = fixture(t);
  const selector = 'p:is(svg|p, #p)';
  for (let repeat = 0; repeat < 2; repeat++) {
    nw.configure({ FORGIVING: true });
    assert.deepEqual(nw.select(selector, document).map(e => e.id), ['p']);
    assert.equal(nw.match(selector, document.getElementById('p')), true);
    nw.configure({ FORGIVING: false });
    assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' });
    assert.throws(() => nw.match(selector, document.getElementById('p')), { name: 'SyntaxError' });
  }
});

test('unforgiving and top-level invalid lists still throw', t => {
  const { document, nw } = fixture(t);
  for (const selector of ['svg|p', 'p,', 'p:not(svg|p, p)']) {
    assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' });
  }
});

test('hexadecimal class escapes', { todo: 'Existing class escape limitation, independent of list splitting' }, t => {
  const { document, nw } = fixture(t);
  assert.equal(nw.match('p.a\\2c b', document.getElementById('p')), true);
});

test('Chromium agrees on every selector', { skip: !process.env.NWSAPI_BROWSER }, async () => {
  const { chromium } = require('@playwright/test');
  const { readFileSync } = require('node:fs');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(markup);
    await page.addScriptTag({ content: readFileSync(require.resolve('../src/nwsapi.js'), 'utf8') });
    for (const [selector, expected] of cases) {
      const result = await page.evaluate(selector => ({
        native: Array.from(document.querySelectorAll(selector), e => e.id),
        nwsapi: NW.Dom.select(selector, document).map(e => e.id)
      }), selector);
      assert.deepEqual(result.native, expected, selector);
      assert.deepEqual(result.nwsapi, expected, selector);
    }
  } finally { await browser.close(); }
});
