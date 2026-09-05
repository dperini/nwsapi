'use strict';
const assert = require('node:assert/strict');
const { test, describe, afterEach } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');
const windows = [];
afterEach(() => { for (const window of windows.splice(0)) window.close(); });
function build(html) {
  const { window } = new JSDOM(html);
  windows.push(window);
  const NW = factory({ document: window.document, DOMException: window.DOMException });
  return { window, document: window.document, NW };
}

describe(':not() with a compound argument', () => {
  // The argument compiles in place rather than going back out through match()
  // once per candidate, so these cover the shapes that inline, the shapes that
  // must not, and that an inlined argument leaves the surrounding walk alone.
  function fixture() {
    return build(
      '<!doctype html><body>' +
        '<div id=d1 class=x><p id=p1 class=a>1</p><p id=p2 class=b>2</p><p id=p3>3</p></div>' +
        '<div id=d2><span id=s1></span></div>' +
        '<div id=d3><div id=d4><p id=p4 class=a>4</p></div></div>' +
        '</body>',
    );
  }

  test('the same answer as the reference engine', () => {
    const { document, NW } = fixture();
    for (const selector of [
      // compound arguments, which compile in place
      'p:not(.a)', 'p:not(#p1)', 'p:not([class])', 'p:not([class="a"])',
      'p:not(:first-child)', 'p:not(:nth-of-type(2n))', 'div:not(:nth-of-type(2n))',
      'p:not(:is(.a, .b))', 'p:not(:not(.a))', 'div:not(:has(p))',
      'p:not(.a):not(.b)', 'div p:not(.a)', 'div:not(.x) p',
      // arguments that keep the call: a list, and a combinator
      'p:not(.a, .b)', 'div:not(p > span)', 'div:not(div p)',
    ]) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      assert.deepEqual(mine, reference, selector);
    }
  });

  test('match() agrees with select() on the same element', () => {
    const { document, NW } = fixture();
    const p2 = document.getElementById('p2');
    assert.equal(NW.match('p:not(.a)', p2), true);
    assert.equal(NW.match('p:not(.b)', p2), false);
    assert.equal(NW.match('p:not(:nth-of-type(2n))', p2), false);
    assert.equal(NW.match('div p:not(.a)', p2), true);
  });

  test('compound arguments avoid per-candidate match delegation', () => {
    const { document, NW } = fixture();
    let calls = 0;
    const original = NW.Snapshot.match;
    NW.Snapshot.match = function(...args) { calls++; return original(...args); };
    assert.deepEqual(NW.select('p:not(.a)', document).map(e => e.id), ['p2', 'p3']);
    assert.equal(calls, 0);
    assert.deepEqual(NW.select('p:not(.a, .b)', document).map(e => e.id), ['p3']);
    assert.ok(calls > 0, 'selector lists retain the general matcher');
  });

  test('an argument the engine cannot read is a syntax error', () => {
    const { document, NW } = fixture();
    for (const selector of ['p:not(@@)', 'p:not()', 'div:not(svg|div)']) {
      assert.throws(() => NW.select(selector, document), selector);
      assert.throws(() => document.querySelectorAll(selector), selector);
    }
    // an argument left unclosed is closed by EOF, as the syntax parser does
    assert.deepEqual(NW.select('p:not(.a', document).map(node => node.id), ['p2', 'p3']);
  });
});
