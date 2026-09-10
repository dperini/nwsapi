import { describe, expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  agrees,
  chart,
  splitCharts,
} from '../../../scripts/repo/bench/charts.mts'
import type { Measurement } from '../../../scripts/repo/bench/charts.mts'
import { geometricSpeedup } from '../../../scripts/repo/bench/summary-chart.mts'
import { isSvgOptimized } from '../../../scripts/repo/gen/svg-optimize.mts'

const row = (selector = 'a'): Measurement => ({
  category: 'basic',
  selector,
  milliseconds: [1, 1],
  errors: [null, null],
})
describe('benchmark charts', () => {
  test('summary weights every query equally and rejects incomplete results', () => {
    const measurements = [
      { ...row(), milliseconds: [1, 4] },
      { ...row(), milliseconds: [100, 25] },
    ]
    expect(geometricSpeedup(measurements)).toBeCloseTo(1)
    expect(() => geometricSpeedup([])).toThrow()
    expect(() =>
      geometricSpeedup([{ ...row(), milliseconds: [null, 1] }]),
    ).toThrow()
    expect(() =>
      geometricSpeedup([{ ...row(), errors: ['mismatch', null] }]),
    ).toThrow()
  })
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
        '1.23ms',
        'other',
        '1.23ms',
      ])
      expect(svg).not.toContain('1.234ms')
    } finally {
      dom.window.close()
    }
  })
  test('renders measured bar widths in the static SVG', () => {
    const svg = chart(
      'basic',
      ['old', 'candidate'],
      [{ ...row(), milliseconds: [1, 4] }],
      '',
    )
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
    try {
      const bars = Array.from(dom.window.document.querySelectorAll('rect.bar'))
      const widths = bars.map(bar => Number(bar.getAttribute('width')))
      expect(widths).toHaveLength(2)
      expect(widths[0]).toBeGreaterThan(0)
      expect(widths[1]).toBeGreaterThan(widths[0]!)
      expect(widths[1]).toBeLessThanOrEqual(480)
      expect(isSvgOptimized(svg)).toBe(true)
    } finally {
      dom.window.close()
    }
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
