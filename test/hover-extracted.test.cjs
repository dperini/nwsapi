'use strict';
const assert = require('node:assert/strict');
const { test, describe, afterEach } = require('node:test');
const { JSDOM } = require('jsdom');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const nwsapiPath = require.resolve('../src/nwsapi.js');
const windows = [];
afterEach(() => { for (const window of windows.splice(0)) window.close(); });

describe(':hover tracking is installed on demand', () => {
  function buildCounting(html) {
    const dom = new JSDOM(html);
    const { window } = dom;
    windows.push(window);
    const seen = [];
    const original = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = function (type, ...rest) {
      seen.push(type);
      return original(type, ...rest);
    };
    delete require.cache[require.resolve(nwsapiPath)];
    const NW = require(nwsapiPath)({
      document: window.document,
      DOMException: window.DOMException,
    });
    return { window, document: window.document, NW, mouseListeners: () => seen.filter(t => t.startsWith('mouse')) };
  }

  test('no listeners until a :hover selector is compiled', () => {
    const { document, NW, mouseListeners } = buildCounting('<!doctype html><body><p id=p>x</p></body>');
    assert.deepEqual(mouseListeners(), []);

    NW.select('p', document);
    assert.deepEqual(mouseListeners(), [], 'an ordinary selector must not install them');

    assert.deepEqual(NW.select('p:hover', document), []);
    assert.deepEqual(mouseListeners(), ['mouseover', 'mouseout']);
  });

  test(':hover still matches once tracking is installed', () => {
    const { window, document, NW } = buildCounting('<!doctype html><body><p id=p>x</p></body>');
    const target = document.getElementById('p');

    assert.equal(NW.match(':hover', target), false);
    target.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(NW.match(':hover', target), true);
    target.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    assert.equal(NW.match(':hover', target), false);
  });

  test('document switches reuse listeners and isolate hover state', () => {
    const a = buildCounting('<!doctype html><p id=a></p>');
    const b = buildCounting('<!doctype html><p id=b></p>');
    const first = a.document.getElementById('a');
    const second = b.document.getElementById('b');
    const hovered = node => a.NW.select('p:hover', node.ownerDocument).includes(node);
    hovered(first);
    first.dispatchEvent(new a.window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(hovered(first), true);
    assert.equal(hovered(second), false);
    second.dispatchEvent(new b.window.MouseEvent('mouseover', { bubbles: true }));
    first.dispatchEvent(new a.window.MouseEvent('mouseout', { bubbles: true }));
    assert.equal(hovered(second), true, 'background events do not clear active hover');
    assert.equal(hovered(first), false);
    assert.equal(hovered(second), true, 'switching restores the document state');
    assert.deepEqual(a.mouseListeners(), ['mouseover', 'mouseout']);
    assert.deepEqual(b.mouseListeners(), ['mouseover', 'mouseout']);
  });

  test('legacy tracking needs neither WeakMap nor WeakSet', () => {
    const a = buildCounting('<!doctype html><p id=a></p>');
    const b = buildCounting('<!doctype html><p id=b></p>');
    const registered = new Set();
    for (const item of [a, b]) {
      const add = item.document.addEventListener.bind(item.document);
      item.document.addEventListener = function(type, callback, ...rest) {
        if (type === 'mouseover' || type === 'mouseout') registered.add(callback);
        return add(type, callback, ...rest);
      };
    }
    const context = { module: { exports: {} }, exports: {}, WeakMap: undefined, WeakSet: undefined };
    vm.runInNewContext(readFileSync(nwsapiPath, 'utf8'), context);
    const nw = context.module.exports({ document: a.document, DOMException: a.window.DOMException });
    nw.configure({ LEGACY: true });
    for (let i = 0; i < 20; i++) {
      const item = i % 2 ? a : b;
      const node = item.document.querySelector('p');
      nw.select('p:hover', item.document);
      node.dispatchEvent(new item.window.MouseEvent('mouseover', { bubbles: true }));
      assert.equal(nw.select('p:hover', item.document)[0], node);
      node.dispatchEvent(new item.window.MouseEvent('mouseout', { bubbles: true }));
      assert.equal(nw.select('p:hover', item.document).length, 0);
    }
    assert.equal(registered.size, 1, 'stable handler identity prevents duplicate listeners');
  });
});
