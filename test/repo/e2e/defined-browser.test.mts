import { expect, test } from 'vitest'
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

test.skipIf(!process.env.NWSAPI_BROWSER)(
  'defined state matches Chromium before and after install',
  async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent(
        '<button id="ordinary"></button><button is="x-button"></button><x-pending></x-pending><svg><font-face></font-face></svg>',
      )
      await page.addScriptTag({
        content: readFileSync(
          new URL('../../../src/nwsapi.js', import.meta.url),
          'utf8',
        ),
      })
      const results = await page.evaluate(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Called with the element receiver below.
      const native = Element.prototype.matches
        const rows: boolean[][] = []
        const check = () => {
          for (const element of document.querySelectorAll('*')) {
            rows.push([
              NW.Dom.match(':defined', element),
              native.call(element, ':defined'),
            ])
          }
        }
        check()
        document.getElementById('ordinary')!.setAttribute('is', 'x-unknown')
        check()
        customElements.define('x-pending', class extends HTMLElement {})
        customElements.define('x-button', class extends HTMLButtonElement {}, {
          extends: 'button',
        })
        check()
        NW.Dom.install()
        check()
        NW.Dom.uninstall()
        return rows
      })
      for (const [actual, expected] of results) {
        expect(actual).toBe(expected)
      }
    } finally {
      await browser.close()
    }
  },
)
