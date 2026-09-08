import { chromium } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Browser } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { chart } from '../../../scripts/repo/bench/charts.mts'

let browser: Browser
beforeAll(async () => {
  if (process.env['NWSAPI_BROWSER']) {
    browser = await chromium.launch()
  }
})
afterAll(async () => {
  await browser?.close()
})

describe.skipIf(!process.env['NWSAPI_BROWSER'])('chart animation', () => {
  test('all published comparison SVGs share a viewport and keep text inside it', async () => {
    const markdown = readFileSync(
      new URL('../../../docs/benchmarks.md', import.meta.url),
      'utf8',
    )
    const paths = [
      ...markdown.matchAll(/!\[[^\]]*\]\(([^)?]+\.svg)(?:\?[^)]*)?\)/g),
    ].map(match => match[1]!)
    expect(paths).toHaveLength(12)
    paths.push('../assets/repo/bench/perf-hero.svg')
    const page = await browser.newPage({
      viewport: { width: 1100, height: 720 },
    })
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const path of paths) {
        const svg = readFileSync(
          new URL('../../../docs/' + path, import.meta.url),
          'utf8',
        )
        await page.goto('data:image/svg+xml,' + encodeURIComponent(svg))
        const bounds = await page.evaluate(() => {
          const canvas = document.documentElement.getBoundingClientRect()
          const texts = Array.from(document.querySelectorAll('text'), node => ({
            text: node.textContent,
            rect: node.getBoundingClientRect(),
          }))
          return {
            viewBox: document.documentElement.getAttribute('viewBox'),
            overflow: texts
              .filter(
                ({ rect }) =>
                  rect.left < canvas.left + 24 ||
                  rect.right > canvas.right - 24 ||
                  rect.bottom > canvas.bottom - 24,
              )
              .map(({ text }) => text),
            title: document.querySelector('text.chart-title')?.textContent,
            metadata: Array.from(
              document.querySelectorAll('text.metadata'),
              node => ({
                font: getComputedStyle(node).fontSize,
                anchor: getComputedStyle(node).textAnchor,
              }),
            ),
            units: Array.from(document.querySelectorAll('.unit'), node => ({
              fill: getComputedStyle(node).fill,
              parentFill: getComputedStyle(node.parentElement!).fill,
            })),
            uppercasePackage: texts.some(
              ({ text }) =>
                text?.includes('NWSAPI') &&
                text !== 'NWSAPI - Fast CSS Selectors API Engine',
            ),
            selectors: document.querySelectorAll('text.selector').length,
          }
        })
        expect(bounds.viewBox, path).toBe('0 0 1100 720')
        expect(bounds.overflow, path).toEqual([])
        expect(bounds.title, path).toBeTruthy()
        expect(bounds.metadata.length, path).toBeGreaterThan(0)
        expect(
          bounds.metadata.every(
            note => note.font === '14px' && note.anchor === 'end',
          ),
          path,
        ).toBe(true)
        expect(bounds.units.length, path).toBeGreaterThan(0)
        expect(
          bounds.units.every(
            unit =>
              unit.fill === 'rgb(117, 128, 142)' &&
              unit.fill !== unit.parentFill,
          ),
          path,
        ).toBe(true)
        expect(bounds.uppercasePackage, path).toBe(false)
        if (path.includes('first-matches.svg')) {
          expect(bounds.selectors).toBe(4)
        }
        if (path.includes('perf-hero.svg')) {
          expect(svg).toContain('Memory footprint')
          expect(svg).toContain('Browser file size')
          expect(bounds.selectors).toBe(0)
        }
      }
    } finally {
      await page.close()
    }
  })

  test('logarithmic bars stay visible across orders of magnitude and respect reduced motion', async () => {
    const svg = chart(
      'Basic selectors',
      ['nwsapi 2.3.0-prerelease', '@asamuzakjp/dom-selector'],
      [
        {
          category: 'basic',
          selector: 'p',
          milliseconds: [0.001, 1],
          errors: [null, null],
        },
      ],
      '',
    )
    const page = await browser.newPage()
    try {
      await page.goto('data:image/svg+xml,' + encodeURIComponent(svg))
      const bars = await page.locator('.bar').evaluateAll(nodes =>
        nodes.map(node => ({
          x: node.getAttribute('x'),
          width: node.getAttribute('width'),
          animations: node.getAnimations().length,
        })),
      )
      expect(bars.map(bar => Number(bar.x))).toEqual([440, 440])
      expect(bars.map(bar => Number(bar.width))).toEqual([120, 480])
      expect(bars.every(bar => bar.animations === 1)).toBe(true)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.reload()
      expect(
        await page
          .locator('.bar')
          .evaluateAll(nodes =>
            nodes.every(
              node =>
                getComputedStyle(node).opacity === '1' &&
                node.getAnimations().length === 0,
            ),
          ),
      ).toBe(true)
    } finally {
      await page.close()
    }
  })
})
