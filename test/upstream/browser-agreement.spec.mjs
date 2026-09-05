/*
 * Differential coverage against the browser's own engine.
 *
 * The WPT suite in wpt.spec.mjs is the conformance test, and it is thorough,
 * but it does not cover every pseudo-class this engine implements: nothing in
 * it exercises ':defined', and the form-state ones it does cover leave gaps.
 * So this asks Chromium the same questions and compares the answers.
 *
 * nwsapi is injected but NOT installed here, on purpose. install() replaces
 * document.querySelectorAll, and this needs the native one to compare with.
 *
 * Four of the selectors below were wrong until this file existed:
 * ':optional' skipped button elements; ':read-write' and ':read-only' read an
 * element's own disabled property, so a control inside a disabled fieldset
 * came out read-write; and a fieldset was ':valid' when it contained a valid
 * control rather than when it contained no invalid one, so a fieldset holding
 * no validation candidates was neither. All four answer what Chromium answers
 * now.
 *
 * One note for whoever compares this engine against jsdom instead. On four of
 * these - ':valid', ':optional', ':read-write' and ':read-only' - jsdom's
 * engine and Chromium disagree, and this engine sides with Chromium. It is
 * not jsdom's DOM that differs: a disabled control reports willValidate
 * false there, the same as in a browser. @asamuzakjp/dom-selector 8.3.0 does
 * not read willValidate at all, deciding ':valid' from validity.valid alone
 * (asamuzaK/domSelector#284, July 2026), and a disabled control has
 * validity.valid true. So a difference against jsdom on these is not a bug
 * here, and matching it would make this engine wrong in a browser.
 *
 * Where Blink decides each of them, pinned so the lines keep meaning what
 * they mean:
 *   ':enabled'    https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2696
 *   ':disabled'   https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2713
 *   ':read-only'  https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2725
 *   ':read-write' https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2738
 *   ':optional'   https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2751
 *   ':valid'      https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2811
 *   ':defined'    https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L3139
 * and the three that carry the substance: a button is optional outright
 * (https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_button_element.h#L113), a control's validity
 * pseudo-classes are its willValidate()
 * (https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_form_control_element.cc#L373), and a
 * fieldset is valid when none of its controls is a candidate and invalid
 * (https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_field_set_element.cc#L108).
 */
/* global document, window */
// ^ the page.evaluate() callbacks below run inside Chromium, not in Node.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const nwsapiSource = readFileSync(path.join(repoRoot, 'src', 'nwsapi.js'), 'utf8');

// One page with a control for every shape these pseudo-classes turn on:
// disabled and enabled, required and not, a disabled fieldset with a legend,
// a nested fieldset, an optgroup, a custom element and a customized built-in.
const MARKUP = `<!doctype html><html lang="en"><body><div id="d1">
  <input id="i1" disabled>
  <input id="i2">
  <input id="i3" required>
  <input id="i4" type="email" value="not-an-email">
  <input id="i5" disabled required>
  <input id="i6" type="number" min="1" max="5" value="3">
  <input id="i7" type="number" min="1" max="5" value="9">
  <input id="i8" readonly value="x">
  <textarea id="t1"></textarea>
  <textarea id="t2" readonly></textarea>
  <fieldset id="fs" disabled>
    <legend id="lg"><input id="li1"></legend>
    <input id="fi1">
    <fieldset id="fs2"><legend id="lg2"><input id="li2"></legend></fieldset>
  </fieldset>
  <fieldset id="fs3"><input id="fi2"></fieldset>
  <form id="f1"><input id="fi3" required><button id="b1">go</button></form>
  <select id="se">
    <optgroup id="og" disabled><option id="op1">a</option></optgroup>
    <optgroup id="og2"><option id="op2" disabled>b</option><option id="op3">c</option></optgroup>
  </select>
  <my-thing id="mt"></my-thing>
  <button id="b2" is="fancy-btn">x</button>
  <div id="ce" contenteditable="true"><span id="ce1">e</span></div>
</div></body></html>`;

// Everything whose answer depends on host state rather than on the tree, plus
// the structural ones as a control: if those ever disagree the fixture itself
// is suspect.
const SELECTORS = [
  ':enabled', ':disabled', ':required', ':optional', ':valid', ':invalid',
  ':in-range', ':out-of-range', ':read-only', ':read-write', ':checked',
  ':indeterminate', ':default', ':defined', ':placeholder-shown',
  ':first-child', ':last-child', ':only-child', ':empty', ':root',
  'input:disabled', 'input:enabled', 'option:disabled', 'button:optional',
  'fieldset :read-write', 'div:has(> input:required)', ':not(:enabled)',
];

test.describe('agreement with the browser', () => {
  test('every state pseudo-class answers what Chromium answers', async ({ page }) => {
    await page.setContent(MARKUP);
    await page.addScriptTag({ content: nwsapiSource });

    const rows = await page.evaluate(selectors => {
      const ids = nodes => Array.from(nodes, node => node.id || node.nodeName.toLowerCase()).join(',');
      return selectors.map(selector => {
        let mine;
        let native;
        try {
          mine = ids(window.NW.Dom.select(selector, document));
        } catch (error) {
          mine = `THREW ${error && error.message}`;
        }
        try {
          native = ids(document.querySelectorAll(selector));
        } catch (error) {
          native = `THREW ${error && error.message}`;
        }
        return { selector, mine, native };
      });
    }, SELECTORS);

    for (const row of rows) {
      expect(row.mine, row.selector).toBe(row.native);
    }
  });

  test('a custom element is defined once it is upgraded', async ({ page }) => {
    await page.setContent(MARKUP);
    await page.addScriptTag({ content: nwsapiSource });

    const before = await page.evaluate(() => ({
      mine: window.NW.Dom.select(':defined', document).some(node => node.id === 'mt'),
      native: document.querySelector('my-thing:defined') !== null,
    }));
    expect(before.mine, 'before the definition exists').toBe(before.native);
    expect(before.mine).toBe(false);

    const after = await page.evaluate(() => {
      window.customElements.define('my-thing', class extends window.HTMLElement {});
      return {
        mine: window.NW.Dom.select(':defined', document).some(node => node.id === 'mt'),
        native: document.querySelector('my-thing:defined') !== null,
      };
    });
    expect(after.mine, 'after it is defined and upgraded').toBe(after.native);
    expect(after.mine).toBe(true);
  });

  test('nothing is both enabled and disabled', async ({ page }) => {
    await page.setContent(MARKUP);
    await page.addScriptTag({ content: nwsapiSource });

    const overlap = await page.evaluate(() => {
      const enabled = window.NW.Dom.select(':enabled', document);
      const disabled = window.NW.Dom.select(':disabled', document);
      return enabled.filter(node => disabled.includes(node)).map(node => node.id);
    });
    expect(overlap).toEqual([]);
  });

  // The factory is normally handed a real window, but an embedder passes only
  // what it has: nwsapi({ document, DOMException }). A matcher read from that
  // object rather than from the node answers every state pseudo-class false,
  // which no jsdom test can see, because jsdom has no state to report either.
  test('the state pseudo-classes still work when the factory gets only a document', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>
      <dialog id="dlg">modal</dialog>
      <div id="pop" popover>pop</div>
    </body></html>`);
    await page.evaluate(() => {
      document.getElementById('dlg').showModal();
      document.getElementById('pop').showPopover();
    });

    const rows = await page.evaluate(source => {
      const module = { exports: {} };
      new Function('module', 'exports', source)(module, module.exports);
      const NW = module.exports({ document: document });
      const dialog = document.getElementById('dlg');
      const popover = document.getElementById('pop');
      return {
        modal: { mine: NW.match(':modal', dialog), native: dialog.matches(':modal') },
        popover: {
          mine: NW.match(':popover-open', popover),
          native: popover.matches(':popover-open'),
        },
      };
    }, nwsapiSource);

    expect(rows.modal.mine, ':modal').toBe(rows.modal.native);
    expect(rows.popover.mine, ':popover-open').toBe(rows.popover.native);
    expect(rows.modal.native, 'the fixture should have an open modal').toBe(true);
    expect(rows.popover.native, 'the fixture should have an open popover').toBe(true);
  });
});
