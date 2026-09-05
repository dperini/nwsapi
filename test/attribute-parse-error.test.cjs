'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');

function fixture(t) {
  const { window } = new JSDOM(
    '<!doctype html><meta id="encoding" charset="utf-8">' +
    '<body><div id="a" class="x"></div><div id="b"></div>');
  t.after(() => window.close());
  return { document: window.document, nw: factory({
    document: window.document, DOMException: window.DOMException
  }) };
}

for (const quote of ['"', "'"]) {
  for (const newline of ['\n', '\r', '\r\n']) {
    const attribute = '[class=' + quote + 'x' + newline + quote + ']';
    const selector = 'div' + attribute;
    test('invalid attribute string: ' + JSON.stringify(selector), t => {
      const { document, nw } = fixture(t);
      const target = document.getElementById('a');
      for (let i = 0; i < 2; i++) {
        assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' });
        assert.throws(() => nw.first(selector, document), { name: 'SyntaxError' });
        assert.throws(() => nw.match(attribute, target), { name: 'SyntaxError' });
      }
    });
    test('quiet invalid attribute string: ' + JSON.stringify(selector), t => {
      const { document, nw } = fixture(t);
      nw.configure({ VERBOSITY: false, LOGERRORS: false });
      assert.deepEqual(nw.select(selector, document), []);
      assert.equal(nw.first(selector, document), null);
      assert.equal(nw.match(attribute, document.getElementById('a')), false);
    });
  }
}

for (const [selector, expected] of [
  ['meta[charset="utf-8"', ['encoding']],
  ['meta[charset="utf-8', ['encoding']],
  ['div:not([class]', ['b']],
  ['div:not([class', ['b']],
  ['div:is([class="x"', ['a']],
  ['div\n[class="x"]', []],
  ['div[class="\\78 "]', ['a']]
]) {
  test('valid selector: ' + JSON.stringify(selector), t => {
    const { document, nw } = fixture(t);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(nw.select(selector, document).map(e => e.id), expected);
      assert.equal(nw.match(selector, document.getElementById('a')), expected.includes('a'));
    }
  });
}

// CSS permits escaped line continuations inside strings. They already fail
// validation before the attribute compiler; fixing that is separate from
// routing a missing attribute match through the normal syntax-error path.
for (const newline of ['\n', '\r', '\r\n', '\f']) {
  test('valid line continuation: ' + JSON.stringify(newline), {
    todo: 'Existing string-tokenization limitation, not fixed by the null-match guard'
  }, t => {
    const { document, nw } = fixture(t);
    assert.deepEqual(nw.select('div[class="x\\' + newline + '"]', document).map(e => e.id), ['a']);
  });
}
