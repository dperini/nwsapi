import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'comment token boundaries agree with Chromium across public query methods',
  async t => {
    const browser = await chromium.launch()
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<main><p id="one" class="item special" data-x="ab"></p><p id="two" class="item" data-x="/*literal*/"></p><span></span></main>',
    )
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    const differences = await page.evaluate(() => {
      const bases = [
        'p',
        '.item.special',
        '#one',
        '[data-x=ab]',
        '[data-x="AB" i]',
        '[data-x~="ab"]',
        ':is(p,span)',
        ':not(.special)',
        'main > p',
        'p:nth-child(odd of .item)',
        'p:nth-child(2n+1)',
        'p:nth-last-child(-n+2 of .item)',
        '[data-x="/*literal*/"]',
        '.\\69 tem',
        ':lang(en)',
      ]
      const selectors = [
        'p/*unterminated',
        'p:nth-child(odd/**/of/**/.item)',
        'p:nth-child(2n/**/+/**/1)',
        'p:nth-child(2/**/of/**/.item)',
        '[data-x=ab/**/i]',
        '.\\31/**/ p',
        'p/**//**/.item',
        ':is(p/**/span,.item)',
        '[data-x="a\\\nb"]',
      ]
      for (const base of bases) {
        for (let i = 0; i <= base.length; i += 1) {
          selectors.push(base.slice(0, i) + '/**/' + base.slice(i))
        }
      }
      const engine = window.NW.Dom
      const element = document.getElementById('one')!
      const attempt = (fn: () => unknown) => {
        try {
          return fn()
        } catch (error) {
          return (error as Error).name
        }
      }
      const failures = []
      for (let pass = 0; pass < 2; pass += 1) {
        for (const selector of selectors) {
          const expected = [
            attempt(() =>
              [...document.querySelectorAll(selector)].map(e => e.id),
            ),
            attempt(() => document.querySelector(selector)?.id ?? null),
            attempt(() => element.matches(selector)),
          ]
          const actual = [
            attempt(() =>
              Array.from(engine.select(selector, document), e => e.id),
            ),
            attempt(() => engine.first(selector, document)?.id ?? null),
            attempt(() => engine.match(selector, element)),
          ]
          if (JSON.stringify(expected) !== JSON.stringify(actual)) {
            failures.push({ selector, expected, actual, pass })
          }
        }
      }
      return failures
    })
    expect(differences).toEqual([])
  },
)
