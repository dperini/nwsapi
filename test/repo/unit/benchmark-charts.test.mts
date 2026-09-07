import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import {
  agrees,
  chart,
  splitCharts,
} from '../../../scripts/repo/bench/charts.mts'
import type { Measurement } from '../../../scripts/repo/bench/charts.mts'
import { isSvgOptimized } from '../../../scripts/repo/gen/svg-optimize.mts'

const row = (selector = 'a'): Measurement => ({
  category: 'basic',
  selector,
  milliseconds: [1, 1],
  errors: [null, null],
})
describe('benchmark charts', () => {
  test('rounds labels to two decimals and bolds exact winners, including ties', () => {
    const svg = chart(
      'basic',
      ['old', 'candidate', 'other'],
      [
        {
          ...row(),
          milliseconds: [1.234, 1.231, 1.231],
          errors: [null, null, null],
        },
      ],
      '',
    )
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
    try {
      const bold = Array.from(
        dom.window.document.querySelectorAll('text'),
      ).filter(node => node.getAttribute('style')?.includes('font-weight:700'))
      expect(bold.map(node => node.textContent)).toEqual([
        'candidate',
        '1.23 ms',
        'other',
        '1.23 ms',
      ])
      expect(svg).not.toContain('1.234 ms')
    } finally {
      dom.window.close()
    }
  })
  test('animates bars from the left and respects reduced motion', () => {
    const svg = chart('basic', ['old', 'candidate'], [row()], '')
    expect(svg).toContain('@keyframes fill')
    expect(svg).toContain('transform-box:fill-box')
    expect(svg).toContain('prefers-reduced-motion:reduce')
    expect(svg).toContain('animation:none')
    expect(isSvgOptimized(svg)).toBe(true)
  })
  test('shows category charts outside the introductory details', () => {
    const document = fs.readFileSync(
      new URL('../../../docs/benchmarks.md', import.meta.url),
      'utf8',
    )
    const firstChart = document.indexOf('## Component queries')
    expect(document.lastIndexOf('</details>')).toBeLessThan(firstChart)
    expect(document.indexOf('How measurements work')).toBeLessThan(
      document.indexOf('Other measurements'),
    )
    expect(document.match(/^## /gm)).toHaveLength(9)
    expect(document).not.toContain('2.0.0')
    expect(document).toContain('2.3.0-prerelease')
    expect(document).toContain('@asamuzakjp/dom-selector')
  })
  test('keeps selector categories separate and at most four rows per chart', () => {
    const groups = splitCharts([
      ...Array.from({ length: 9 }, (_, index) => row(String(index))),
      { ...row(), category: 'forms' },
    ])
    expect(groups.map(group => group.rows.length)).toEqual([4, 4, 1, 1])
    expect(groups.map(group => group.name)).toEqual([
      'basic-1',
      'basic-2',
      'basic-3',
      'forms-1',
    ])
  })
  test('escapes selectors and metadata and renders equal measurements', () => {
    const svg = chart('<script>', ['old', 'candidate'], [row('a > b')], 'x & y')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('a &gt; b')
    expect(svg).toContain('x &amp; y')
    expect(svg).not.toMatch(/NaN|Infinity/)
    expect(isSvgOptimized(svg)).toBe(true)
  })
  test('shows unsupported results without giving them a speed score', () => {
    const svg = chart(
      'unsupported',
      ['old', 'candidate'],
      [
        {
          ...row(),
          milliseconds: [null, null],
          errors: ['unsupported', 'result mismatch'],
        },
      ],
      'same run',
    )
    expect(svg).toContain('result mismatch')
    expect(svg).not.toMatch(/NaN|Infinity/)
  })
  test('rejects invalid or oversized chart inputs', () => {
    expect(() =>
      chart(
        'x',
        ['old', 'new'],
        [{ ...row(), errors: ['wrong nodes', null] }],
        '',
      ),
    ).toThrow(TypeError)
    expect(() =>
      chart(
        'x',
        ['old', 'new'],
        Array.from({ length: 5 }, () => row()),
        '',
      ),
    ).toThrow(RangeError)
    expect(() =>
      chart('x', ['old', 'new'], [{ ...row(), milliseconds: [NaN, 1] }], ''),
    ).toThrow(TypeError)
  })
  test('checks node identity and order, not only result counts', () => {
    const a = {} as Element
    const b = {} as Element
    expect(agrees([a, b], [a, b])).toBe(true)
    expect(agrees([a, b], [b, a])).toBe(false)
    expect(agrees([a, a], [a, b])).toBe(false)
    expect(agrees([a], [a, b])).toBe(false)
  })
})
