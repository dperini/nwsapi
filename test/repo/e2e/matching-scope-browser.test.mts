import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'matching scope and language ranges agree with browser queries',
  async t => {
    const executablePath = process.env['NWSAPI_BROWSER_EXECUTABLE']
    const browser = await chromium.launch(
      executablePath ? { executablePath } : browserLaunchOptions(),
    )
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<main lang="en-US"><div class="same"><div class="same"><p class="item"></p><p class="item"></p></div></div><p lang="fr"></p><p lang=""></p></main>',
    )
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    const comparisonFailures = await page.evaluate(() => {
      const engine = window.NW.Dom
      const main = document.querySelector('main')!
      const failures: string[] = []
      const selectors = [
        ':scope',
        ':is(:scope)',
        ':not(:scope)',
        ':scope > .same',
        'p:nth-child(2 of :scope > .item)',
        ':lang("en")',
        ':lang(en, fr)',
        ':lang("en-*")',
        ':lang("*-US")',
        ':lang("")',
        ':lang("*")',
      ]
      for (const selector of selectors) {
        // Older Chromium builds do not yet accept the extended language grammar.
        if (
          selector.startsWith(':lang(') &&
          !CSS.supports('selector(' + selector + ')')
        ) {
          continue
        }
        for (let pass = 0; pass < 2; pass++) {
          const actual = Array.from(engine.select(selector, main))
          const expected = main.querySelectorAll(selector)
          if (
            actual.length !== expected.length ||
            actual.some((node, index) => node !== expected[index])
          ) {
            failures.push('select: ' + selector)
          }
          for (const node of main.querySelectorAll('*')) {
            if (engine.match(selector, node) !== node.matches(selector)) {
              failures.push('match: ' + selector)
            }
            if (engine.closest(selector, node) !== node.closest(selector)) {
              failures.push('closest: ' + selector)
            }
          }
        }
      }
      return failures
    })
    expect(comparisonFailures).toEqual([])
  },
)
