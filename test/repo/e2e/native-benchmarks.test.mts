import { browserLaunchOptions } from '../../../scripts/repo/browser.mts'
import { test, expect } from 'vitest'
import { chromium } from '@playwright/test'
import {
  nativePage,
  nativeSources,
} from '../../../scripts/repo/bench/native-host.mts'
import type { NativeGlobals } from '../../../scripts/repo/bench/native-host.mts'
import { nativeTiming } from '../../../scripts/repo/bench/native-timing.mts'

test.skipIf(!process.env['NWSAPI_BROWSER'])(
  'direct comparison checks both libraries and prevents fixture scripts from executing',
  async () => {
    const browser = await chromium.launch(browserLaunchOptions())
    try {
      const page = await nativePage(browser, await nativeSources())
      const html =
        '<!doctype html><script>top.__fixtureExecuted = true</script><main><p class="item">One</p></main>'
      for (const first of [false, true]) {
        const report = await nativeTiming(page, {
          html,
          selectors: [{ category: 'basic', selector: '.item' }],
          first,
          rounds: 1,
          iterations: 100,
          minRoundMs: 1,
          coldCount: 2,
        })
        expect(report.rows[0]!.errors).toEqual([null, null])
        expect(
          report.rows[0]!.samples.every(samples => samples.length === 1),
        ).toBe(true)
        expect(report.consumed).toBeGreaterThan(0)
      }
      expect(await page.evaluate(() => '__fixtureExecuted' in window)).toBe(
        false,
      )
      const failed = await nativeTiming(page, {
        html,
        selectors: [{ category: 'invalid', selector: ':unknown-selector' }],
        first: false,
        rounds: 1,
        iterations: 1,
        minRoundMs: 1,
        coldCount: 1,
      }).then(
        () => false,
        () => true,
      )
      expect(failed).toBe(true)
      expect(
        await page.evaluate(() => {
          const host = window as unknown as NativeGlobals
          const contexts = [0, 1].map(engine =>
            host.__createContext('<p id="direct"></p>', engine),
          )
          const result = contexts.every(
            context => context.first('p')?.id === 'direct',
          )
          contexts.forEach(context => context.frame.remove())
          return result
        }),
      ).toBe(true)
    } finally {
      await browser.close()
    }
  },
)
