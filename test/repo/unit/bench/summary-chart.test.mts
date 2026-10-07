import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  geometricSpeedup,
  summaryChart,
} from '../../../../scripts/repo/bench/summary-chart.mts'
import type { SummaryMetric } from '../../../../scripts/repo/bench/summary-chart.mts'

test('summary chart preserves the three measured scales and validates all inputs', () => {
  assert.equal(
    geometricSpeedup([
      {
        category: 'a',
        selector: 'a',
        errors: [null, null],
        milliseconds: [1, 4],
      },
      {
        category: 'a',
        selector: 'b',
        errors: [null, null],
        milliseconds: [4, 1],
      },
    ]),
    1,
  )
  const metrics: SummaryMetric[] = Array.from({ length: 3 }, (_, index) => ({
    title: `Metric ${index}`,
    detail: '<case>',
    headline: '2×',
    values: [1, 2],
    labels: ['1ms', '2ms'],
  }))
  const notes = ['Recorded nwsapi measurements', 'Runtime Node', 'Sources']
  const dom = new JSDOM(summaryChart(metrics, notes), {
    contentType: 'image/svg+xml',
  })
  assert.equal(dom.window.document.querySelectorAll('.metric-title').length, 3)
  assert.equal(dom.window.document.querySelectorAll('.engine').length, 6)
  dom.window.close()
  assert.throws(() => summaryChart(metrics.slice(0, 2), notes))
  assert.throws(() => summaryChart(metrics, []))
  assert.throws(() =>
    summaryChart(
      metrics.map(metric => ({ ...metric, values: [0, 1] })),
      notes,
    ),
  )
  assert.throws(() =>
    geometricSpeedup([
      { category: 'a', selector: 'a', errors: [null, null], milliseconds: [1] },
    ]),
  )
  assert.throws(() =>
    geometricSpeedup([
      {
        category: 'a',
        selector: 'a',
        errors: [null, null],
        milliseconds: [Infinity, 1],
      },
    ]),
  )
  assert.throws(() =>
    geometricSpeedup([
      {
        category: 'a',
        selector: 'a',
        errors: [null, null],
        milliseconds: [0, 1],
      },
    ]),
  )
})
