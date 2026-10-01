import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'prepared queries preserve results and scope after mutation and document switches',
  async t => {
    const browser = await chromium.launch({
      ...browserLaunchOptions(),
      headless: true,
    })
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<!doctype html><main class="root">' +
        '<section><i class="item" data-hit></i><b class="item" data-hit></b></section>'.repeat(
          64,
        ) +
        '</main>',
    )
    await page.addScriptTag({ content: readFileSync('dist/nwsapi.js', 'utf8') })
    const results = await page.evaluate(() => {
      const engine = NW.Dom
      const selectors = [
        '.item[data-hit]',
        'i[data-hit]',
        'section .item',
        'i ~ b',
        ':is(.item):not(.missing)',
        ':not(:not(.item))',
      ]
      const rows: boolean[] = []
      const check = (doc: Document) => {
        for (const selector of selectors) {
          const expected = Array.from(doc.querySelectorAll(selector))
          const actual = Array.from(engine.select(selector, doc))
          rows.push(
            actual.length === expected.length &&
              actual.every((node, index) => node === expected[index]),
          )
          for (const node of expected.slice(0, 2)) {
            rows.push(engine.closest('.root', node) === node.closest('.root'))
            rows.push(engine.closest(':scope', node) === node)
          }
        }
      }
      check(document)
      const exposed = engine.select('.item[data-hit]', document) as Element[]
      exposed.length = 0
      check(document)
      document.querySelector('i')!.remove()
      document.querySelector('b')!.removeAttribute('data-hit')
      check(document)
      const other = document.implementation.createHTMLDocument('other')
      other.body.innerHTML =
        '<main class="root"><section><i class="item" data-hit></i><b class="item"></b></section></main>'
      check(other)
      check(document)
      const xml = new DOMParser().parseFromString(
        '<root><Item class="item"/><item/></root>',
        'application/xml',
      )
      const first = xml.documentElement.firstElementChild!
      rows.push(engine.match('Item:not(.missing)', first))
      rows.push(!engine.match('item:not(.missing)', first))
      check(document)
      return rows
    })
    expect(results.length).toBeGreaterThan(100)
    expect(results.every(Boolean)).toBe(true)
  },
)
