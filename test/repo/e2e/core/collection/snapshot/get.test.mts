import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { expect, test } from 'vitest'
import { browserLaunchOptions } from '../../../../../../scripts/repo/browser.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'native snapshots keep tag membership and evaluate class predicates live',
  async t => {
    const browser = await chromium.launch(browserLaunchOptions())
    t.onTestFinished(() => browser.close())
    const page = await browser.newPage()
    await page.setContent(
      '<!doctype html><main>' +
        '<i class="item" data-hit></i>'.repeat(40) +
        '</main>',
    )
    await page.addScriptTag({
      content: readFileSync(
        new URL('../../../../../../dist/nwsapi.js', import.meta.url),
        'utf8',
      ),
    })
    await page.addScriptTag({
      content: readFileSync(
        new URL(
          '../../../../../../dist/modules/nwsapi-legacy.js',
          import.meta.url,
        ),
        'utf8',
      ),
    })
    const failures = await page.evaluate(async () => {
      const engine = window.NW.Dom
      const root = document.querySelector('main')!
      const selectors = [
        'i',
        '.item',
        'i.item',
        '[class="item"]',
        '[data-hit]',
        ':is(i, b)',
        'main i',
        'main :is(i, b)',
        'main:has(.item)',
      ]
      const errors: string[] = []
      const check = () => {
        for (const context of [document, root]) {
          for (const selector of selectors) {
            const expected = Array.from(context.querySelectorAll(selector))
            const actual = Array.from(engine.select(selector, context))
            if (
              actual.length !== expected.length ||
              actual.some((node, index) => node !== expected[index])
            ) {
              errors.push(selector)
            }
          }
        }
      }
      check()
      root.firstElementChild!.className = 'other'
      root.lastElementChild!.removeAttribute('data-hit')
      check()
      await Promise.resolve()
      check()
      const inserted = document.createElement('b')
      inserted.className = 'item'
      root.prepend(inserted)
      check()
      root.append(root.children[1]!)
      check()
      root.firstElementChild!.remove()
      await Promise.resolve()
      check()
      root.remove()
      root.firstElementChild!.className = 'other'
      check()
      document.body.append(root)
      engine.configure({ NODE_LIST: true })
      check()
      engine.configure({ LEGACY: true, NODE_LIST: false })
      check()
      return errors
    })
    expect(failures).toEqual([])
  },
)
