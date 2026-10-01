import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'prepared logical and first-position queries agree with Chromium after mutations',
  async t => {
    const browser = await chromium.launch({
      ...browserLaunchOptions(),
      headless: true,
    })
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<!doctype html><main>' +
        Array.from(
          { length: 512 },
          (_, index) => '<i class="item" id="i' + index + '"></i>',
        ).join('') +
        '</main>',
    )
    await page.addScriptTag({ content: readFileSync('dist/nwsapi.js', 'utf8') })
    const report = await page.evaluate(() => {
      const engine = NW.Dom
      const main = document.querySelector('main')!
      const last = document.getElementById('i511')!
      const selectors = [
        'i[data-hit]:nth-child(2n)',
        'i:nth-child(2n):is(.missing,[data-hit])',
        'i:is(.missing,:audit-unknown)',
        'i:nth-child(2n):is(:nth-child(4n),.missing)',
        'i:nth-last-child(2n), i:nth-child(2n)',
      ]
      const rows: Array<{
        selector: string
        native: string[]
        actual: string[]
        nativeFirst: string | undefined
        first: string | undefined
      }> = []
      const compare = (context: Document | DocumentFragment) => {
        for (const selector of selectors) {
          rows.push({
            selector,
            native: Array.from(context.querySelectorAll(selector), e => e.id),
            actual: Array.from(engine.select(selector, context), e => e.id),
            nativeFirst: context.querySelector(selector)?.id,
            first: engine.first(selector, context)?.id,
          })
        }
      }
      compare(document)
      last.setAttribute('data-hit', '')
      compare(document)
      main.firstElementChild!.remove()
      compare(document)
      const fragment = document.createDocumentFragment()
      fragment.append(main)
      compare(fragment)
      return rows
    })
    for (const row of report) {
      expect(row.actual, row.selector).toEqual(row.native)
      expect(row.first, row.selector).toBe(row.nativeFirst)
    }
  },
)
