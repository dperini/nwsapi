import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { test } from 'vitest'
import { cases, markup } from '../unit/fixtures/forgiving-cases.mts'

test.skipIf(!process.env.NWSAPI_BROWSER)(
  'Chromium agrees on every forgiving selector',
  async t => {
    const browser = await chromium.launch({ headless: true })
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(markup)
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../src/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    for (const [selector, expected] of cases) {
      const result = await page.evaluate(
        browserSelector => ({
          native: Array.from(
            document.querySelectorAll(browserSelector),
            e => e.id,
          ),
          nwsapi: NW.Dom.select(browserSelector, document).map(e => e.id),
        }),
        selector,
      )
      assert.deepEqual(result.native, expected, selector)
      assert.deepEqual(result.nwsapi, expected, selector)
    }
  },
)
