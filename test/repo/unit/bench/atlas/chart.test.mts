import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { atlasChart } from '../../../../../scripts/repo/bench/atlas/chart.mts'
import type { Measurement } from '../../../../../scripts/repo/bench/charts.mts'

test('atlas charts encode timing ranges and unavailable measurements as valid standalone SVG', () => {
  const rows: Measurement[] = [
    {
      category: 'class',
      selector: '.card > i',
      milliseconds: [1, 2],
      errors: [null, null],
      samples: [
        [0.5, 1.5],
        [1, 3],
      ],
    },
    {
      category: 'unsupported',
      selector: '<unsafe>',
      milliseconds: [null, null],
      errors: ['unsupported', null],
    },
    {
      category: 'id',
      selector: '#a',
      milliseconds: [0.5, 0.75],
      errors: [null, null],
    },
  ]
  const dom = new JSDOM(
    atlasChart(
      'Timing <comparison>',
      ['candidate', 'competitor'],
      rows,
      'Recorded rounds',
    ),
    { contentType: 'image/svg+xml' },
  )
  const root = dom.window.document.documentElement
  assert.equal(root.namespaceURI, 'http://www.w3.org/2000/svg')
  assert.equal(root.getAttribute('height'), '556')
  assert.equal(root.querySelector('title')!.textContent, 'Timing <comparison>')
  assert.equal(root.textContent!.includes('<unsafe>'), true)
  assert.equal(root.querySelectorAll('parsererror').length, 0)
  assert.ok(root.querySelectorAll('path').length > 0)
  dom.window.close()
  for (let index = 0, length = 2; index < length; index += 1) {
    const fallback = new JSDOM(
      atlasChart('Empty', ['a', 'b'], index ? [rows[1]!] : [], ''),
      { contentType: 'image/svg+xml' },
    )
    assert.equal(
      fallback.window.document.querySelectorAll('parsererror').length,
      0,
    )
    fallback.window.close()
  }
})
