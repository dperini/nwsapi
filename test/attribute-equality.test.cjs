'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const source = readFileSync(join(__dirname, '../src/nwsapi.js'), 'utf8');
const markup = '<!doctype html><input id=i type=checkbox><div id=d data-k=TYPE></div><div id=e data-k=""></div><div id=m></div><svg><g id=s data-k=TYPE></g></svg>';
const cases = [
  ['input[type="CHECKBOX"]', ['i']],
  ['div[data-k="type"]', []],
  ['[data-k="TYPE"]', ['d', 's']],
  ['[data-k="type" i]', ['d', 's']],
  ['[data-k=""]', ['e']],
  ['[missing="null"]', []],
  ['[data-k="T\\59 PE"]', ['d', 's']],
  ['[data-k^="TY"]', ['d', 's']],
  ['[data-k$="PE"]', ['d', 's']],
  ['[data-k*="YP"]', ['d', 's']]
];

test('exact comparisons preserve attribute case rules', () => {
  const { window } = new JSDOM(markup);
  try {
    const nw = require('../src/nwsapi')(window);
    assert.match(nw.compile('[data-k="TYPE"]', false).toString(), /getAttribute\("data-k"\)=="TYPE"/);
    assert.match(nw.compile('[data-k="type" i]', false).toString(), /\.test\(/);
    assert.match(nw.compile('[type="CHECKBOX"]', false).toString(), /\.test\(/);
    for (const [selector, expected] of cases) {
      assert.deepEqual(nw.select(selector).map(e => e.id), expected, selector);
      assert.deepEqual(nw.select(selector).map(e => e.id), expected, selector + ' cached');
    }
    for (const [value, selector] of [
      ['é', '[data-k="\\e9"]'],
      ['😀', '[data-k="\\1f600"]'],
      ['a"b', "[data-k='a\"b']"],
      ['a"b', '[data-k="a\\"b"]'],
      ['a\\b', '[data-k="a\\\\b"]'],
      ['a.b', '[data-k="a\\.b"]']
    ]) {
      window.document.getElementById('d').setAttribute('data-k', value);
      assert.deepEqual(nw.select(selector).map(e => e.id), ['d'], selector);
    }
    nw.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' });
    assert.equal(nw.match('[data-k!="a.b"]', window.document.getElementById('d')), false);
    assert.equal(nw.match('[data-k!="other"]', window.document.getElementById('d')), true);
  } finally { window.close(); }
});

test('XML attributes remain case-sensitive', () => {
  const { window } = new JSDOM('<root><input id="i" type="checkbox"/><g id="s" data-k="TYPE"/></root>', { contentType: 'application/xml' });
  try {
    const nw = require('../src/nwsapi')(window);
    assert.deepEqual(nw.select('[type="CHECKBOX"]'), []);
    assert.deepEqual(nw.select('[type="checkbox"]').map(e => e.id), ['i']);
    assert.deepEqual(nw.select('[data-k="type"]'), []);
    assert.deepEqual(nw.select('[data-k="type" i]').map(e => e.id), ['s']);
  } finally { window.close(); }
});

test('Chromium independently verifies HTML case rules', { skip: !process.env.NWSAPI_BROWSER }, async () => {
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(markup);
    await page.addScriptTag({ content: source });
    for (const [selector, expected] of cases) {
      const result = await page.evaluate(selector => ({
        native: [...document.querySelectorAll(selector)].map(e => e.id),
        nwsapi: NW.Dom.select(selector).map(e => e.id)
      }), selector);
      assert.deepEqual(result.native, expected, selector + ' native');
      assert.deepEqual(result.nwsapi, expected, selector + ' nwsapi');
    }
  } finally { await browser.close(); }
});
