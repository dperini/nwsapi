'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '../src/nwsapi.js'), 'utf8');
const createNwsapi = require('../src/nwsapi.js');
// Substitute before loading jsdom, which captures the factory on import but
// creates its engine lazily. Restore the module cache after that import.
const resolved = require.resolve('nwsapi', { paths: [require.resolve('jsdom')] });
const previous = require(resolved);
let creations = 0;
require.cache[resolved].exports = global => { creations++; return createNwsapi(global); };
const { JSDOM } = require('jsdom');
require.cache[resolved].exports = previous;
const pseudos = [':modal', ':fullscreen', ':picture-in-picture', ':open', ':closed', ':popover-open'];

function host(t) {
  const dom = new JSDOM('<!doctype html><div popover></div>');
  t.after(() => dom.window.close());
  return dom.window;
}

for (const legacy of [false, true]) test(`delegating matchers are called once per document (LEGACY=${legacy})`, t => {
  const windows = [host(t), host(t)];
  const nw = createNwsapi({ document: windows[0].document });
  nw.configure({ LEGACY: legacy });
  const calls = [0, 0];
  const nodes = windows.map(w => w.document.querySelector('div'));
  windows.forEach((w, i) => {
    w.Element.prototype.matches = function(selector) {
      assert.ok(++calls[i] < 10, 'unbounded recursion');
      return nw.match(selector, this);
    };
  });
  for (let i = 0; i < 50; i++) {
    for (const node of nodes) for (const pseudo of pseudos) assert.equal(nw.match(pseudo, node), false);
  }
  assert.deepEqual(calls, [1, 1]);
});

test('browser bootstrap safely captures an already-delegating prototype', t => {
  const window = host(t);
  let nw, calls = 0;
  window.Element.prototype.matches = function(selector) {
    assert.ok(++calls < 10, 'unbounded recursion');
    return nw.match(selector, this);
  };
  const context = { document: window.document, Element: window.Element };
  vm.runInNewContext(source, context);
  nw = context.NW.Dom;
  const node = window.document.querySelector('div');
  for (let i = 0; i < 50; i++) assert.equal(nw.match(':popover-open', node), false);
  assert.equal(calls, 1);
});

test('the original jsdom Element.matches route uses this engine without recursion', t => {
  const window = host(t);
  const before = creations;
  const node = window.document.body.firstElementChild;
  for (let i = 0; i < 50; i++) for (const pseudo of pseudos) assert.equal(node.matches(pseudo), false);
  assert.equal(creations - before, 1, 'jsdom must exercise the source under test');
});

test('delegation remains cached when a re-entering matcher subsequently throws', t => {
  const window = host(t);
  const nw = createNwsapi({ document: window.document });
  const node = window.document.querySelector('div');
  let calls = 0;
  window.Element.prototype.matches = function(selector) {
    calls++;
    nw.match(selector, this);
    throw new Error('host failed after re-entry');
  };
  for (let i = 0; i < 10; i++) assert.equal(nw.match(':popover-open', node), false);
  assert.equal(calls, 1);
});

test('an unsupported selector does not disable other host state queries', t => {
  const window = host(t);
  window.Element.prototype.matches = function(selector) {
    if (selector === ':fullscreen') throw new Error('unsupported');
    return selector === ':popover-open';
  };
  const nw = createNwsapi({ document: window.document });
  const node = window.document.querySelector('div');
  assert.equal(nw.match(':fullscreen', node), false);
  assert.equal(nw.match(':popover-open', node), true);
});

test('re-entry involving another document marks the outer record', t => {
  const a = host(t), b = host(t);
  const nw = createNwsapi({ document: a.document });
  const first = a.document.querySelector('div'), second = b.document.querySelector('div');
  let calls = 0;
  a.Element.prototype.matches = function(selector) { calls++; return nw.match(selector, second); };
  b.Element.prototype.matches = () => true;
  assert.equal(nw.match(':popover-open', first), false);
  assert.equal(nw.match(':popover-open', second), true);
  assert.equal(nw.match(':popover-open', first), false);
  assert.equal(calls, 1);
});

test('hosts without WeakMap retain bounded recursion and the single-document fast path', t => {
  const window = host(t);
  const context = { module: { exports: {} }, exports: {}, WeakMap: undefined };
  vm.runInNewContext(source, context);
  const nw = context.module.exports({ document: window.document });
  nw.configure({ LEGACY: true });
  let calls = 0;
  window.Element.prototype.matches = function(selector) { calls++; return nw.match(selector, this); };
  const node = window.document.querySelector('div');
  for (let i = 0; i < 50; i++) assert.equal(nw.match(':popover-open', node), false);
  assert.equal(calls, 1);
});
