'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { chromium } = require('@playwright/test');
const source = readFileSync(resolve(__dirname, '../src/nwsapi.js'), 'utf8');

test('browser state stays live across factory shapes, documents, and install()', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  for (const mode of ['script', 'document', 'window', 'install-before', 'install-after']) {
    await t.test(mode, async () => {
      const page = await browser.newPage();
      try {
        await page.setContent('<!doctype html><dialog></dialog><div popover></div><iframe></iframe>');
        const results = await page.evaluate(({ source, mode }) => {
          const native = Element.prototype.matches;
          let nw;
          if (mode === 'document' || mode === 'window') {
            const module = { exports: {} };
            new Function('module', 'exports', source)(module, module.exports);
            nw = module.exports(mode === 'window' ? window : { document, DOMException });
          } else {
            (0, eval)(source);
            nw = NW.Dom;
          }
          const other = document.querySelector('iframe').contentDocument;
          other.body.innerHTML = '<dialog></dialog><div popover></div>';
          const pairs = [document, other].map(doc => [doc.querySelector('dialog'), doc.querySelector('[popover]')]);
          if (mode === 'install-before') nw.install();
          const results = [];
          function check() {
            for (let i = 0; i < 3; i++) for (const [dialog, popover] of pairs) {
              results.push([nw.match(':modal', dialog), native.call(dialog, ':modal')]);
              results.push([nw.match(':popover-open', popover), native.call(popover, ':popover-open')]);
            }
          }
          check();
          if (mode === 'install-after') nw.install();
          for (const [dialog, popover] of pairs) { dialog.showModal(); popover.showPopover(); }
          check();
          for (const [dialog, popover] of pairs) { dialog.close(); popover.hidePopover(); }
          check();
          return results;
        }, { source, mode });
        assert.ok(results.some(([, expected]) => expected === true));
        for (const [actual, expected] of results) assert.equal(actual, expected);
      } finally { await page.close(); }
    });
  }
});
