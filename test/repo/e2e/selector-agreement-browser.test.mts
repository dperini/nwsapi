/* global document, window */
// ^ the page.evaluate() callbacks below run inside Chromium, not in Node.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  test,
} from 'vitest'
import type { Browser, Page } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const nwsapiSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'nwsapi.js'),
  'utf8',
)

// One page with a control for every shape these pseudo-classes turn on:
// disabled and enabled, required and not, a disabled fieldset with a legend,
// a nested fieldset, an optgroup, a custom element and a customized built-in.
let browser: Browser
let page: Page
beforeAll(async () => {
  if (process.env.NWSAPI_BROWSER) {
    browser = await chromium.launch({ headless: true })
  }
})
afterAll(async () => {
  await browser?.close()
})
beforeEach(async () => {
  if (browser) {
    page = await browser.newPage()
  }
})
afterEach(async () => {
  await page?.close()
})

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
</div></body></html>`

// Everything whose answer depends on host state rather than on the tree, plus
// the structural ones as a control: if those ever disagree the fixture itself
// is suspect.
const SELECTORS = [
  ':enabled',
  ':disabled',
  ':required',
  ':optional',
  ':valid',
  ':invalid',
  ':in-range',
  ':out-of-range',
  ':read-only',
  ':read-write',
  ':checked',
  ':indeterminate',
  ':default',
  ':defined',
  ':placeholder-shown',
  ':first-child',
  ':last-child',
  ':only-child',
  ':empty',
  ':root',
  'input:disabled',
  'input:enabled',
  'option:disabled',
  'button:optional',
  'fieldset :read-write',
  'div:has(> input:required)',
  ':not(:enabled)',
]

describe.skipIf(!process.env.NWSAPI_BROWSER)(
  'agreement with the browser',
  () => {
    test('every state pseudo-class answers what Chromium answers', async () => {
      await page.setContent(MARKUP)
      await page.addScriptTag({ content: nwsapiSource })

      const rows = await page.evaluate(selectors => {
        const ids = nodes =>
          Array.from(
            nodes,
            (node: Element) => node.id || node.nodeName.toLowerCase(),
          ).join(',')
        return selectors.map(selector => {
          let mine
          let native
          try {
            mine = ids(window.NW.Dom.select(selector, document))
          } catch (error) {
            mine = `THREW ${error && error.message}`
          }
          try {
            native = ids(document.querySelectorAll(selector))
          } catch (error) {
            native = `THREW ${error && error.message}`
          }
          return { selector, mine, native }
        })
      }, SELECTORS)

      for (const row of rows) {
        expect(row.mine, row.selector).toBe(row.native)
      }
    })

    test('a custom element is defined once it is upgraded', async () => {
      await page.setContent(MARKUP)
      await page.addScriptTag({ content: nwsapiSource })

      const before = await page.evaluate(() => ({
        mine: window.NW.Dom.select(':defined', document).some(
          node => node.id === 'mt',
        ),
        native: document.querySelector('my-thing:defined') !== null,
      }))
      expect(before.mine, 'before the definition exists').toBe(before.native)
      expect(before.mine).toBe(false)

      const after = await page.evaluate(() => {
        window.customElements.define(
          'my-thing',
          class extends window.HTMLElement {},
        )
        return {
          mine: window.NW.Dom.select(':defined', document).some(
            node => node.id === 'mt',
          ),
          native: document.querySelector('my-thing:defined') !== null,
        }
      })
      expect(after.mine, 'after it is defined and upgraded').toBe(after.native)
      expect(after.mine).toBe(true)
    })

    test('nothing is both enabled and disabled', async () => {
      await page.setContent(MARKUP)
      await page.addScriptTag({ content: nwsapiSource })

      const overlap = await page.evaluate(() => {
        const enabled = window.NW.Dom.select(':enabled', document)
        const disabled = window.NW.Dom.select(':disabled', document)
        return enabled
          .filter(node => disabled.includes(node))
          .map(node => node.id)
      })
      expect(overlap).toEqual([])
    })

    // The factory is normally handed a real window, but an embedder passes only
    // what it has: nwsapi({ document, DOMException }). A matcher read from that
    // object rather than from the node answers every state pseudo-class false,
    // which no jsdom test can see, because jsdom has no state to report either.
    test('the state pseudo-classes still work when the factory gets only a document', async () => {
      await page.setContent(`<!doctype html><html><body>
      <dialog id="dlg">modal</dialog>
      <div id="pop" popover>pop</div>
    </body></html>`)
      await page.evaluate(() => {
        document.querySelector<HTMLDialogElement>('#dlg').showModal()
        document.getElementById('pop').showPopover()
      })

      const rows = await page.evaluate(source => {
        const module = {
          exports: {} as typeof factory,
        }
        // oxlint-disable-next-line typescript/no-implied-eval -- Exercise the documented CommonJS factory in the browser.
        new Function('module', 'exports', source)(module, module.exports)
        const NW = module.exports({ document: document })
        const dialog = document.getElementById('dlg')
        const popover = document.getElementById('pop')
        return {
          modal: {
            mine: NW.match(':modal', dialog),
            native: dialog.matches(':modal'),
          },
          popover: {
            mine: NW.match(':popover-open', popover),
            native: popover.matches(':popover-open'),
          },
        }
      }, nwsapiSource)

      expect(rows.modal.mine, ':modal').toBe(rows.modal.native)
      expect(rows.popover.mine, ':popover-open').toBe(rows.popover.native)
      expect(rows.modal.native, 'the fixture should have an open modal').toBe(
        true,
      )
      expect(
        rows.popover.native,
        'the fixture should have an open popover',
      ).toBe(true)
    })
  },
)
import type factory from '../../../src/nwsapi.js'
