import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'vitest'
import { chromium } from '@playwright/test'
import { markup, cases } from '../fixtures/attribute-equality.mts'

test(
  'Chromium independently verifies HTML case rules',
  { skip: !process.env['NWSAPI_BROWSER'] },
  async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent(markup)
      await page.addScriptTag({
        content: fs.readFileSync(
          new URL('../../../src/nwsapi.js', import.meta.url),
          'utf8',
        ),
      })
      for (const [selector, expected] of cases) {
        const result = await page.evaluate(
          query => ({
            native: [...document.querySelectorAll(query)].map(e => e.id),
            nwsapi: Array.from(NW.Dom.select(query)).map(e => e.id),
          }),
          selector,
        )
        assert.deepEqual(result.native, expected, selector + ' native')
        assert.deepEqual(result.nwsapi, expected, selector + ' nwsapi')
      }
    } finally {
      await browser.close()
    }
  },
)
