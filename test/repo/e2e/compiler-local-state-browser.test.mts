import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'nested selector compilation preserves Chromium query behavior',
  async t => {
    const browser = await chromium.launch({
      ...browserLaunchOptions(),
      headless: true,
    })
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<main><p class="a b"><i class="a b"></i></p><p class="a"><i class="a b"></i></p></main>',
    )
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../dist/modules/nwsapi-legacy.js', import.meta.url),
        'utf8',
      ),
    })

    const failures = await page.evaluate(() => {
      const engine = window.NW.Dom
      const differences: string[] = []
      const compare = (selector: string) => {
        const expected = Array.from(document.querySelectorAll(selector))
        const actual = Array.from(engine.select(selector, document))
        if (
          actual.length !== expected.length ||
          actual.some((element, index) => element !== expected[index])
        ) {
          differences.push(selector)
        }
      }

      const nested = ':not(:nth-child(2)):is(.a.b, :not(.missing))'
      engine.compile(nested, true, false)
      compare(nested)
      engine.configure({}, true)
      engine.compile(nested, true, false)
      compare(nested)

      const inline = ':is(.a.b):where(.a)'
      engine.compile(inline, true, false)
      compare(inline)

      const validated = ':not(:nth-child(2))'
      engine.compile(validated, true, false)
      engine.compile(':is(:not(:nth-child(3)))', true, false)
      engine.configure({}, true)
      engine.compile(validated, true, false)
      compare(validated)

      let reentered = false
      engine.registerSelector('reenter', /^:(reenter)(.*)/, (match, source) => {
        if (!reentered) {
          reentered = true
          engine.compile(':not(:nth-child(3))', true, false)
        }
        return { source, status: true, match }
      })
      const nodes = Array.from(document.querySelectorAll('p'))
      for (const legacy of [false, true]) {
        engine.configure({ LEGACY: legacy }, true)
        const selector = ':not(:nth-child(3)):reenter'
        const first = engine.compile(selector, true, true)!
        const firstResult = first(nodes, () => false, document, []) as Element[]
        if (
          firstResult.length !== nodes.length ||
          firstResult.some((node, index) => node !== nodes[index])
        ) {
          differences.push(`first:${legacy}`)
        }
        engine.configure({}, true)
        reentered = false
        const second = engine.compile(selector, true, true)!
        const secondResult = second(
          nodes,
          () => false,
          document,
          [],
        ) as Element[]
        if (
          secondResult.length !== nodes.length ||
          secondResult.some((node, index) => node !== nodes[index])
        ) {
          differences.push(`second:${legacy}`)
        }
        if (!engine.match(selector, nodes[0]!)) {
          differences.push(`match:${legacy}`)
        }
      }
      return differences
    })

    expect(failures).toEqual([])
  },
)
