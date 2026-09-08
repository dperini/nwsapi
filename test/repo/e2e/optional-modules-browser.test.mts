import { expect, test } from 'vitest'
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

for (const core of ['src/nwsapi.js', 'dist/nwsapi.min.js'] as const) {
  test.skipIf(!process.env['NWSAPI_BROWSER'])(
    `optional scripts work after ${core} with real layout`,
    async () => {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.setContent(
          '<main>text<!-- gap --><p id="a">shown</p><p id="b" style="display:none">hidden</p><p id="c">shown</p><input type="button" id="button"></main>',
        )
        for (const file of [
          core,
          'src/modules/nwsapi-traversal.js',
          'src/modules/nwsapi-jquery.js',
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
