import { expect, test } from 'vitest'
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

for (const legacy of [false, true] as const) {
  test.skipIf(!process.env['NWSAPI_BROWSER'])(
    `optional scripts work with real layout (legacy=${legacy})`,
    async () => {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.setContent(
          '<main>text<!-- gap --><p id="a">shown</p><p id="b" style="display:none">hidden</p><p id="c">shown</p><input type="button" id="button"></main>',
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
        for (const file of [
          'dist/modules/nwsapi-traversal.js',
          'dist/modules/nwsapi-jquery.js',
        ] as const) {
          await page.addScriptTag({ content: readFileSync(file, 'utf8') })
        }
        expect(
          await page.evaluate(() => {
            const e = NW.Dom,
              main = document.querySelector('main'),
              a = document.getElementById('a'),
              c = document.getElementById('c')
            const ids = (selector: string) =>
              Array.from(e.select(selector, main!)).map(node => node.id)
            return {
              down: e.down!(main!)!.id,
              next: e.next!(a!)!.id,
              previous: e.previous!(c!, 'p')!.id,
              up: e.up!(a!, 'main') === main,
              visible: ids('p:visible'),
              hidden: ids('p:hidden'),
              odd: ids('p:odd'),
              button: ids(':button'),
              has: e.match('main:has(> :button)', main!),
            }
          }),
        ).toEqual({
          down: 'a',
          next: 'b',
          previous: 'b',
          up: true,
          visible: ['a', 'c'],
          hidden: ['b'],
          odd: ['b'],
          button: ['button'],
          has: true,
        })
      } finally {
        await browser.close()
      }
    },
  )
}
