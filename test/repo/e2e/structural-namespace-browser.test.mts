import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'

for (const legacy of [false, true]) {
  test.skipIf(!process.env['NWSAPI_BROWSER'])(
    `filtered positions and XML namespaces agree with Chromium (legacy=${legacy})`,
    async () => {
      const browser = await chromium.launch({ headless: true })
      try {
        const page = await browser.newPage()
        await page.setContent(
          '<main><p id="a" class="item"></p><b id="b"></b><p id="c" class="item"></p><p id="d" class="item"><i></i></p></main>',
        )
        await page.addScriptTag({
          content: readFileSync('dist/nwsapi.js', 'utf8'),
        })
        if (legacy) {
          await page.addScriptTag({
            content: readFileSync('dist/modules/nwsapi-legacy.js', 'utf8'),
          })
          await page.evaluate(() => NW.Dom.configure({ LEGACY: true }))
        }
        const comparisons = await page.evaluate(() => {
          const engine = window.NW.Dom
          const main = document.querySelector('main')!
          const rows: Array<{
            selector: string
            native: string[]
            actual: string[]
            first: string | undefined
          }> = []
          const compare = (
            selector: string,
            context: Document | Element | DocumentFragment,
          ) => {
            rows.push({
              selector,
              native: Array.from(
                context.querySelectorAll(selector),
                node => node.id,
              ),
              actual: Array.from(
                engine.select(selector, context),
                node => node.id,
              ),
              first: engine.first(selector, context)?.id,
            })
          }
          for (const context of [document, main]) {
            for (const selector of [
              'p:nth-child(2 of .item)',
              'p:nth-last-child(1 of .item)',
              'p:nth-child(2n of :not([hidden]))',
              ':nth-child(1 of :has(i), #c)',
              'p:nth-child(1 of :nth-child(even of .item))',
            ]) {
              compare(selector, context)
            }
          }
          main.children[0]!.classList.remove('item')
          compare(':nth-child(2 of .item)', main)
          const fragment = document.createDocumentFragment()
          fragment.append(...main.childNodes)
          compare(':nth-last-child(1 of .item)', fragment)
          const xml = new DOMParser().parseFromString(
            '<s:root xmlns:s="urn:first" xmlns:t="urn:second"><Item id="upper"/><item id="bare"/><s:item id="first" s:x="one" t:x="two"/><t:item id="other"/><s:item id="last" x="two"/></s:root>',
            'application/xml',
          )
          for (const context of [xml, xml.documentElement]) {
            for (const selector of [
              'Item',
              'item',
              '*|item',
              '|item',
              'root item',
              ':is(Item,item)',
              'item:first-of-type',
              'item:last-of-type',
              'item:only-of-type',
              'item:nth-of-type(1)',
              'item:nth-of-type(2)',
              'item:nth-last-of-type(2n)',
              '[*|x]',
              '[*|x="two"]',
              '[|x]',
              '[|x="two"]',
            ]) {
              compare(selector, context)
            }
          }
          return rows
        })
        for (const row of comparisons) {
          expect(row.actual, row.selector).toEqual(row.native)
          expect(row.first, row.selector).toBe(row.native[0])
        }
      } finally {
        await browser.close()
      }
    },
  )
}
