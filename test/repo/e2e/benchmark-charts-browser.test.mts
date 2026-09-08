import { chromium } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Browser } from '@playwright/test'
import { chart } from '../../../scripts/repo/bench/charts.mts'

let browser: Browser
beforeAll(async () => {
  if (process.env.NWSAPI_BROWSER) {
    browser = await chromium.launch()
  }
})
afterAll(async () => {
  await browser?.close()
})

describe.skipIf(!process.env.NWSAPI_BROWSER)('chart animation', () => {
  test('fills from a fixed left edge and shows full bars with reduced motion', async () => {
    const svg = chart(
      'basic',
      ['nwsapi 2.3.0-prerelease'],
      [
        {
          category: 'basic',
          selector: 'p',
          milliseconds: [1],
          errors: [null],
        },
      ],
      '',
    )
    const page = await browser.newPage()
    try {
      await page.goto('data:image/svg+xml,' + encodeURIComponent(svg))
      expect(
        await page
          .getByText('nwsapi 2.3.0-prerelease', { exact: true })
          .evaluate(node => getComputedStyle(node).fontWeight),
      ).toBe('700')
      const frames = await page.evaluate(() => {
        const bar = document.querySelector('.bar')!
        const animation = bar.getAnimations()[0]
        animation.pause()
        return [0, 400, 800].map(time => {
          animation.currentTime = time
          const { x, width } = bar.getBoundingClientRect()
          return { x, width }
        })
      })
      expect(frames[0].width).toBe(0)
      expect(frames[1].width).toBeGreaterThan(0)
      expect(frames[1].width).toBeLessThan(frames[2].width)
      expect(frames[2].width).toBeCloseTo(380)
      for (const frame of frames) {
        expect(frame.x).toBeCloseTo(frames[0].x)
      }

      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.reload()
      const reduced = await page.evaluate(() => {
        const bar = document.querySelector('.bar')!
        return {
          width: bar.getBoundingClientRect().width,
          animations: bar.getAnimations().length,
        }
      })
      expect(reduced.width).toBeCloseTo(380)
      expect(reduced.animations).toBe(0)
    } finally {
      await page.close()
    }
  })
})
