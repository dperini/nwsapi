import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { compactQueryChart } from '../../../../scripts/repo/bench/compact-query-chart.mts'
import type { QueryChartOptions } from '../../../../scripts/repo/bench/query-chart.mts'

test('compact query chart shares one log scale for exactly four highlighted queries', () => {
  const rows: QueryChartOptions['rows'] = Array.from(
    { length: 4 },
    (_, index) => ({
      selector: `.a${index}`,
      warm: index % 2 ? [1, 0.1] : [0.1, 1],
      cold: [10, 1],
    }),
  )
  const options: QueryChartOptions = {
    names: ['nwsapi', 'other'],
    rows,
    notes: ['Recorded timings', ['Input ', { code: 'source.mts' }], 'node'],
  }
  const dom = new JSDOM(compactQueryChart(options), {
    contentType: 'image/svg+xml',
  })
  try {
    assert.equal(
      dom.window.document.documentElement.getAttribute('height'),
      '720',
    )
    assert.equal(dom.window.document.querySelectorAll('circle').length, 16)
    assert.equal(dom.window.document.querySelectorAll('.comparison').length, 4)
    assert.equal(dom.window.document.querySelectorAll('.metadata').length, 2)
  } finally {
    dom.window.close()
  }
  assert.throws(() => compactQueryChart({ ...options, rows: rows.slice(0, 3) }))
  assert.throws(() => compactQueryChart({ ...options, notes: [] }))
  assert.throws(() =>
    compactQueryChart({
      ...options,
      rows: rows.map(row => ({ ...row, warm: [0, 1] })),
    }),
  )
})
