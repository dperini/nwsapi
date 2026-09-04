'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');

function fixture(t) {
  const { window } = new JSDOM('<div><ul><li><a id=a></a></li></ul></div><section id=s><a id=b></a></section>');
  t.after(() => window.close());
  return { document: window.document, nw: factory({ document: window.document, DOMException: window.DOMException }) };
}

test('the filter stops unproductive sampling and retries later', t => {
  const { document, nw } = fixture(t);
  const state = { seen: 0, kept: 0, rest: 0 };
  const target = document.getElementById('a');
  for (let i = 0; i < 64; i++) assert.equal(nw.Snapshot.mayMatch(target, 0, state), true);
  assert.equal(state.rest, 4096);
  for (let i = 0; i < 4096; i++) assert.equal(nw.Snapshot.mayMatch(target, 0, state), true);
  assert.deepEqual(state, { seen: 0, kept: 0, rest: 0 });
  nw.Snapshot.mayMatch(target, 0, state);
  assert.equal(state.seen, 1);
});

test('each compiled resolver owns its adaptive counters', t => {
  const { document, nw } = fixture(t);
  const first = nw.compile('div ul li a', true);
  const second = nw.compile('body div ul a', true);
  assert.match(first.toString(), /s\.mayMatch\(e,\d+,a\)/);
  assert.match(second.toString(), /s\.mayMatch\(e,\d+,a\)/);
  assert.deepEqual(first([document.getElementById('a')], null, document, []).map(e => e.id), ['a']);
});

test('filtering preserves results across movement and document changes', t => {
  const { document, nw } = fixture(t);
  for (const selector of ['div ul li a', 'body div a', 'body section a', 'div > ul > li > a']) {
    for (let i = 0; i < 3; i++) assert.deepEqual(nw.select(selector, document).map(e => e.id), Array.from(document.querySelectorAll(selector), e => e.id));
  }
  document.querySelector('li').append(document.getElementById('b'));
  assert.deepEqual(nw.select('div ul li a', document).map(e => e.id), ['a', 'b']);
  const other = document.implementation.createHTMLDocument('other');
  other.body.innerHTML = '<div><ul><li><a id=c></a></li></ul></div>';
  assert.deepEqual(nw.select('div ul li a', other).map(e => e.id), ['c']);
});

test('adaptive counters are isolated and expire with evicted resolvers', t => {
  const { document, nw } = fixture(t);
  const states = [];
  const original = nw.Snapshot.mayMatch;
  nw.Snapshot.mayMatch = (node, mask, state) => {
    states.push(state);
    return original(node, mask, state);
  };
  const run = selector => nw.compile(selector, true)([document.getElementById('a')], null, document, []);
  run('div ul li a');
  run('body div ul a');
  assert.notEqual(states[0], states[1]);
  run('div ul li a');
  assert.equal(states[0], states[2]);
  for (let i = 0; i < 5000; i++) nw.compile('div ul li .unused-' + i, true);
  run('div ul li a');
  assert.notEqual(states[0], states[3]);
});

test('legacy mode bypasses the ancestor filter', t => {
  const { document, nw } = fixture(t);
  nw.configure({ LEGACY: true }, true);
  nw.Snapshot.mayMatch = () => { throw Error('legacy filter'); };
  assert.deepEqual(nw.select('div ul li a', document).map(e => e.id), ['a']);
});

test('throwing callbacks do not retain stale ancestor summaries', t => {
  const { document, nw } = fixture(t);
  const run = nw.compile('div ul a', true, true);
  assert.throws(() => run([document.getElementById('b'), document.getElementById('a')], () => { throw Error('stop'); }, document, []), /stop/);
  document.querySelector('ul').append(document.getElementById('s'));
  assert.deepEqual(nw.select('div ul a', document).map(e => e.id), ['a', 'b']);
});
