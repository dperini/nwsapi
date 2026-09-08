import { chromium } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Browser } from '@playwright/test'
import { readFileSync } from 'node:fs'
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
  test('keeps the README notes inside the canvas with bottom padding', async () => {
    const svg = readFileSync(
      new URL('../../../assets/repo/bench/perf-hero.svg', import.meta.url),
      'utf8',
    )
    const page = await browser.newPage({
      viewport: { width: 1100, height: 900 },
    })
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('data:image/svg+xml,' + encodeURIComponent(svg))
      const bounds = await page.evaluate(() => {
        const canvas = document.documentElement.getBoundingClientRect()
        const texts = Array.from(document.querySelectorAll('text'), node =>
          node.getBoundingClientRect(),
        )
        const notes = Array.from(document.querySelectorAll('.note'), node =>
          node.getBoundingClientRect(),
        )
        return {
          padding: canvas.bottom - Math.max(...texts.map(rect => rect.bottom)),
          overflow: texts.some(
            rect => rect.left < canvas.left || rect.right > canvas.right,
          ),
          notePadding: Math.min(
            ...notes.map(rect => canvas.right - rect.right),
          ),
          firstNoteWidth: notes[0].width,
          tickFont: getComputedStyle(document.querySelector('.tick')!).fontSize,
          comparisonFont: getComputedStyle(
            document.querySelector('.comparison')!,
          ).fontSize,
          metadataGap: notes[3].top - notes[2].bottom,
          metadataColors: Array.from(
            document.querySelectorAll('.metadata, .metadata .code'),
            node => getComputedStyle(node).fill,
          ),
          noteText: Array.from(
            document.querySelectorAll('.note'),
            node => node.textContent,
          ),
          matchingNoteFonts: Array.from(
            document.querySelectorAll('.note .code'),
          ).every(
            node =>
              getComputedStyle(node).fontSize ===
              getComputedStyle(node.parentElement!).fontSize,
          ),
        }
      })
      expect(bounds.padding).toBeGreaterThanOrEqual(39)
      expect(bounds.overflow).toBe(false)
      expect(bounds.notePadding).toBeGreaterThanOrEqual(48)
      expect(bounds.firstNoteWidth).toBeGreaterThan(650)
      expect(bounds.metadataGap).toBeGreaterThanOrEqual(16)
      expect(bounds.tickFont).toBe('16px')
      expect(bounds.comparisonFont).toBe('16px')
      expect(new Set(bounds.metadataColors)).toEqual(
        new Set(['rgb(117, 128, 142)']),
      )
      expect(bounds.noteText[1]).toBe(
        'Cold queries run a selector first on a fresh document. Warm queries repeat it.',
      )
      expect(bounds.noteText.slice(-3)[0]).toMatch(/^Cold speedups/)
      expect(bounds.noteText.slice(-3)[1]).toMatch(/^nwsapi v/)
      expect(bounds.noteText.slice(-3)[2]).toMatch(/^Direct engine API/)
      expect(bounds.matchingNoteFonts).toBe(true)
      expect(await page.locator('.bar').count()).toBe(24)
      expect(await page.locator('g > title').count()).toBe(24)
    } finally {
      await page.close()
    }
  })

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
      expect(frames[2].width).toBeCloseTo(480)
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
      expect(reduced.width).toBeCloseTo(480)
      expect(reduced.animations).toBe(0)
    } finally {
      await page.close()
    }
  })
})
