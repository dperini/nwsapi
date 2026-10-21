import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import { browserLaunchOptions } from '../../../../../scripts/repo/browser.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'native chain collections preserve identity after resizing, mutations, and document switches',
  async t => {
    const browser = await chromium.launch(browserLaunchOptions())
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent('<!doctype html><body></body>')
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    const mismatches = await page.evaluate(() => {
      const engine = window.NW.Dom
      const detached = document.implementation.createHTMLDocument('detached')
      const frame = document.createElement('iframe')
      document.body.append(frame)
      const documents = [frame.contentDocument!, detached, document]
      const selectors = [
        'main section i',
        'main section :is(i, b)',
        'main section.row .hit',
      ]
      const failures: string[] = []
      for (const context of documents) {
        for (const width of [0, 1, 15, 16, 17, 80]) {
          const main = context.createElement('main')
          main.innerHTML =
            '<section class="row">' +
            '<i class="hit"></i><b></b>'.repeat(width) +
            '<section class="row"><b></b><i class="hit"></i></section></section>' +
            '<section class="row"><i class="hit"></i></section>'
          context.body.append(main)
          const check = () => {
            for (const selector of selectors) {
              const expected = [...context.querySelectorAll(selector)]
              const result = Array.from(engine.select(selector, context))
              if (
                result.length !== expected.length ||
                result.some((node, index) => node !== expected[index])
              ) {
                failures.push(`${width}: ${selector}`)
              }
            }
          }
          check()
          const result = engine.select(selectors[0]!, context) as Element[]
          result.reverse()
          result.length = 0
          check()
          main.querySelector('i')!.remove()
          main.querySelector('section')!.prepend(context.createElement('i'))
          main.lastElementChild!.className = 'other'
          check()
          main.remove()
          check()
        }
      }
      frame.remove()
      return failures
    })
    expect(mismatches).toEqual([])
  },
)
