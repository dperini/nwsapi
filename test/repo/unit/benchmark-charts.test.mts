import { describe, expect, test } from 'vitest'
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
