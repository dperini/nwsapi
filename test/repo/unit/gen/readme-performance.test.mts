import { JSDOM } from 'jsdom'
import type * as Fs from 'node:fs'
import type * as SummaryChart from '../../../../scripts/repo/bench/summary-chart.mts'
import { expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ write: vi.fn(), refresh: vi.fn() }))
vi.mock('node:fs', async original => ({
  ...(await original<typeof Fs>()),
  writeFileSync: mocks.write,
}))
vi.mock('../../../../scripts/repo/gen/chart-references.mts', () => ({
  refreshChartReferences: mocks.refresh,
}))

test('hero and first-match charts use aligned production measurements', async () => {
  await import('../../../../scripts/repo/gen/readme-performance.mts')
  expect(mocks.write).toHaveBeenCalledTimes(2)
  expect(
    mocks.write.mock.calls.map(([url]) => url.pathname.split('/').at(-1)),
  ).toEqual(['first-matches.svg', 'perf-hero.svg'])
  for (let i = 0, length = mocks.write.mock.calls.length; i < length; i += 1) {
    const dom = new JSDOM(mocks.write.mock.calls[i]![1], {
      contentType: 'image/svg+xml',
    })
    expect(dom.window.document.documentElement.getAttribute('role')).toBe('img')
    expect(dom.window.document.querySelectorAll('text').length).toBeGreaterThan(
      10,
    )
    dom.window.close()
  }
  expect(mocks.refresh).toHaveBeenCalledOnce()
})

test('rejects non-browser measurements before publishing charts', async () => {
  vi.resetModules()
  mocks.write.mockClear()
  const actual = await vi.importActual<typeof Fs>('node:fs')
  vi.doMock('node:fs', () => ({
    ...actual,
    writeFileSync: mocks.write,
    readFileSync: (file: Parameters<typeof actual.readFileSync>[0]) => {
      const data = JSON.parse(actual.readFileSync(file, 'utf8'))
      data.metadata.runtime = 'Node.js'
      return JSON.stringify(data)
    },
  }))
  await expect(
    import('../../../../scripts/repo/gen/readme-performance.mts'),
  ).rejects.toThrow()
  expect(mocks.write).not.toHaveBeenCalled()
  vi.doUnmock('node:fs')
})

test('charts honestly represent a slower, larger candidate', async () => {
  vi.resetModules()
  mocks.write.mockClear()
  const actual = await vi.importActual<typeof Fs>('node:fs')
  vi.doMock('node:fs', () => ({
    ...actual,
    writeFileSync: mocks.write,
    readFileSync: (file: Parameters<typeof actual.readFileSync>[0]) => {
      const data = JSON.parse(actual.readFileSync(file, 'utf8'))
      if (String(file).endsWith('memory-footprint.json')) {
        data.rows[0].queried.median = data.rows[1].queried.median * 2
      }
      if (String(file).endsWith('file-size.json')) {
        data.rows[0].brotli = data.rows[1].brotli * 2
      }
      return JSON.stringify(data)
    },
  }))
  vi.doMock(
    '../../../../scripts/repo/bench/summary-chart.mts',
    async original => ({
      ...(await original<typeof SummaryChart>()),
      geometricSpeedup: () => 0.5,
    }),
  )
  await import('../../../../scripts/repo/gen/readme-performance.mts')
  const dom = new JSDOM(mocks.write.mock.calls[1]![1], {
    contentType: 'image/svg+xml',
  })
  expect(dom.window.document.querySelectorAll('text').length).toBeGreaterThan(
    10,
  )
  dom.window.close()
  vi.doUnmock('node:fs')
  vi.doUnmock('../../../../scripts/repo/bench/summary-chart.mts')
})
