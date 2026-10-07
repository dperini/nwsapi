import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { afterEach, test, vi } from 'vitest'

const browser = vi.hoisted(() => ({
  launch: vi.fn(),
  newPage: vi.fn(),
  close: vi.fn(),
  evaluate: vi.fn(),
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: browser.launch } }))
vi.mock('../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/fixture/chrome' }),
}))
import {
  queryChart,
  wrapQueryNotes,
} from '../../../../scripts/repo/bench/query-chart.mts'
import type { QueryChartOptions } from '../../../../scripts/repo/bench/query-chart.mts'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const options: QueryChartOptions = {
  names: ['nwsapi', 'other'],
  rows: [
    { selector: '<unsafe>', warm: [0.001, 0.002], cold: [10, 1] },
    { selector: '.a', warm: [0.2, 0.1], cold: [1, 2] },
  ],
  notes: ['Recorded timings', ['Source ', { code: 'selector.mts' }], 'node'],
  metadataStart: 1,
}

test('query chart renders cold and warm endpoints with safe labels and independent metadata layout', () => {
  const svg = new JSDOM(queryChart(options), { contentType: 'image/svg+xml' })
  try {
    assert.equal(svg.window.document.querySelectorAll('circle').length, 8)
    assert.equal(svg.window.document.querySelectorAll('.metadata').length, 2)
    assert.equal(
      Array.from(svg.window.document.querySelectorAll('text')).some(
        node => node.textContent === '<unsafe>',
      ),
      true,
    )
    assert.equal(svg.window.document.querySelectorAll('.tick').length, 5)
  } finally {
    svg.window.close()
  }
  const fallback = new JSDOM(
    queryChart({
      names: options.names,
      notes: options.notes,
      bottomPadding: 0,
      rows: [{ selector: 'a', warm: [1, 1], cold: [1, 1] }],
    }),
    { contentType: 'image/svg+xml' },
  )
  assert.equal(fallback.window.document.querySelectorAll('.metadata').length, 0)
  fallback.window.close()
  const invalid = [
    { ...options, rows: [] },
    { ...options, notes: [] },
    { ...options, bottomPadding: -1 },
    { ...options, bottomPadding: Infinity },
    { ...options, metadataStart: -1 },
    { ...options, metadataStart: 1.5 },
    { ...options, metadataStart: 3 },
    { ...options, rows: [{ selector: 'a', warm: [0, 1], cold: [1, 1] }] },
  ]
  for (let index = 0, length = invalid.length; index < length; index += 1) {
    assert.throws(
      () => queryChart(invalid[index] as QueryChartOptions),
      RangeError,
    )
  }
  assert.throws(
    () =>
      queryChart({
        ...options,
        rows: [
          {
            selector: 'a',
            warm: [] as unknown as [number, number],
            cold: [1, 1],
          },
        ],
      }),
    RangeError,
  )
})

test('note wrapping measures code fonts, explicit boundaries and long lines, then closes the browser', async () => {
  browser.launch.mockResolvedValue(browser)
  browser.newPage.mockResolvedValue(browser)
  const context = {
    font: '',
    measureText: (word: string) => ({ width: word.length * 100 }),
  }
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => context }),
  })
  browser.evaluate.mockImplementation(async (callback, argument) =>
    callback(argument),
  )
  const lines = await wrapQueryNotes(
    ['one two three four', [{ code: 'filename.mts' }, ' end'], '  '],
    [1],
  )
  assert.ok(lines.length >= 3)
  assert.ok(
    lines
      .flat()
      .some(part => typeof part === 'object' && part.code === 'filename.mts'),
  )
  assert.equal(browser.close.mock.calls.length, 1)
  await wrapQueryNotes([''])
  browser.evaluate.mockRejectedValue(new Error('canvas unavailable'))
  await assert.rejects(wrapQueryNotes(['one']))
  assert.equal(browser.close.mock.calls.length, 3)
})
