'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');

for (const state of ['buffering', 'stalled']) {
  test(':' + state + ' implies :playing', {
    todo: 'Archive approximation contradicts the resource-state definition'
  }, t => {
    const { window } = new JSDOM('<video id="v"></video>');
    t.after(() => window.close());
    const video = window.document.getElementById('v');
    const nw = factory(window);
    Object.defineProperties(video, {
      networkState: { value: 2 }, currentTime: { value: 1 },
      paused: { value: false }, readyState: { value: 1 }
    });
    assert.equal(nw.match(':' + state, video), true);
    assert.equal(nw.match(':playing', video), true);
    assert.equal(nw.match(':paused', video), false);
  });
}

test('non-media elements do not acquire paused or seeking state', t => {
  const { window } = new JSDOM('<div id="d"></div>');
  t.after(() => window.close());
  const nw = factory(window);
  for (const selector of [':paused', ':seeking', ':buffering', ':stalled', ':volume-locked']) {
    assert.equal(nw.match(selector, window.document.getElementById('d')), false);
  }
});
