import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'
import type * as NodeFs from 'node:fs'
import type * as NodePath from 'node:path'
import type * as Playwright from '@playwright/test'
const __dirname = import.meta.dirname
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
const { readFileSync } = require('node:fs') as typeof NodeFs
const path = require('node:path') as typeof NodePath
import { test } from 'vitest'
const { chromium } = require('@playwright/test') as typeof Playwright
import stringCases from '../common/fixture/attribute-string-cases.mts'
const cases: Array<{ selector: string; value: string }> = stringCases.slice()

for (const quote of ['"', "'"] as const) {
  for (const newline of ['\n', '\r', '\r\n', '\f'] as const) {
    cases.push({
      selector: 'div[data-x=' + quote + 'x' + newline + quote + ']',
      value: 'x',
    })
  }
}
for (const selector of [
  'meta[charset="utf-8"',
  'meta[charset="utf-8',
  'div:not([class]',
  'div:not([class',
  'div:is([class="x"',
  'div\n[class="x"]',
  'div[class="\\78 "]',
] as const) {
  cases.push({ selector, value: 'x' })
}
for (const newline of ['\n', '\r', '\r\n', '\f'] as const) {
  cases.push({ selector: 'div[class="x\\' + newline + '"]', value: 'x' })
}

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'attribute strings agree with native Chromium on cold and cached calls',
  async t => {
    const browser = await chromium.launch({
      ...browserLaunchOptions(),
      headless: true,
    })
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<!doctype html><meta id="encoding" charset="utf-8">' +
        '<body><div id="a" class="x"></div><div id="b"></div>',
    )
    await page.addScriptTag({
      content: readFileSync(
        path.join(__dirname, '../../../dist/nwsapi.js'),
        'utf8',
      ),
    })
    const browserDifferences = await page.evaluate(browserCases => {
      const nw = window.NW.Dom
      const target = document.getElementById('a')
      const differences = []
      const attempt = (fn: () => unknown) => {
        try {
          return { value: fn() }
        } catch (error) {
          return { error: error instanceof Error ? error.name : String(error) }
        }
      }
      for (const { selector, value } of browserCases) {
        target!.setAttribute('data-x', value)
        for (let pass = 0; pass < 2; ++pass) {
          const expected = [
            attempt(() =>
              Array.from(document.querySelectorAll(selector), e => e.id),
            ),
            attempt(() => document.querySelector(selector)?.id || null),
            attempt(() => target!.matches(selector)),
          ]
          const actual = [
            attempt(() =>
              Array.from(nw.select(selector, document)).map(e => e.id),
            ),
            attempt(() => nw.first(selector, document)?.id || null),
            attempt(() => nw.match(selector, target!)),
          ]
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            differences.push({ selector, pass, expected, actual })
          }
        }
      }
      return differences
    }, cases)
    assert.deepEqual(browserDifferences, [])
    console.info(
      cases.length +
        ' selector cases; select, first and match; two passes; Chromium ' +
        browser.version(),
    )
  },
)
