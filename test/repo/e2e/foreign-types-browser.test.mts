import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'foreign HTML type matching agrees with Chromium after mutation and XML switching',
  async t => {
    const browser = await chromium.launch()
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<main class="item"><p class="item" id="html"></p><svg><foreignObject class="item" id="svg"></foreignObject></svg></main>',
    )
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    const failures = await page.evaluate(async () => {
      const engine = window.NW.Dom
      const main = document.querySelector('main')!
      const selectors = [
        'p',
        'P',
        '*|p',
        '*|P',
        'p.item',
        'P.item',
        ':is(p,span)',
        'main p',
        'main > p',
        'main.item > p',
        'p:first-of-type',
        'p:nth-of-type(2)',
        'svg foreignObject.item',
        'svg foreignobject.item',
        'svg FOREIGNOBJECT.item',
      ]
      const differences: Array<{
        selector: string
        expected: unknown
        actual: unknown
        element?: string
      }> = []
      const check = (context: Document | Element | DocumentFragment) => {
        for (const selector of selectors) {
          const expectedList = [...context.querySelectorAll(selector)].map(
            e => e.id,
          )
          const actualList = Array.from(
            engine.select(selector, context),
            e => e.id,
          )
          if (JSON.stringify(actualList) !== JSON.stringify(expectedList)) {
            differences.push({
              selector,
              expected: expectedList,
              actual: actualList,
            })
          }
          {
            const expected = context.querySelector(selector)?.id ?? null
            const actual = engine.first(selector, context)?.id ?? null
            if (expected !== actual) {
              differences.push({ selector, expected, actual })
            }
          }
          for (const element of context.querySelectorAll('*')) {
            const expected = element.matches(selector)
            const actual = engine.match(selector, element)
            if (expected !== actual) {
              differences.push({
                selector,
                element: element.id,
                expected,
                actual,
              })
            }
          }
        }
      }
      check(document)
      for (const [namespace, name] of [
        ['urn:foreign', 's:p'],
        ['urn:foreign', 's:P'],
        ['urn:foreign', 'P'],
        ['http://www.w3.org/1999/xhtml', 'h:p'],
      ]) {
        const element = document.createElementNS(namespace!, name!)
        element.id = name!
        element.classList.add('item')
        main.append(element)
      }
      check(document)
      await new Promise(resolve => setTimeout(resolve, 0))
      check(main)
      const fragment = document.createDocumentFragment()
      fragment.append(main)
      check(fragment)
      const xml = new DOMParser().parseFromString(
        '<root xmlns:s="urn:foreign"><s:p id="lower"/><s:P id="upper"/></root>',
        'text/xml',
      )
      check(xml)
      check(fragment)
      return differences
    })
    expect(failures).toEqual([])
  },
)
