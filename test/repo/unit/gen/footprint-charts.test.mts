import { JSDOM } from 'jsdom'
import type * as Fs from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ write: vi.fn(), refresh: vi.fn() }))
vi.mock('node:fs', async original => ({
  ...(await original<typeof Fs>()),
  writeFileSync: mocks.write,
}))
vi.mock('../../../../scripts/repo/gen/chart-references.mts', () => ({
  refreshChartReferences: mocks.refresh,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

test('creates accessible charts with finite measurements and zero-based scales', async () => {
  await import('../../../../scripts/repo/gen/footprint-charts.mts')
  expect(mocks.write).toHaveBeenCalledTimes(2)
  for (let i = 0, length = mocks.write.mock.calls.length; i < length; i += 1) {
    const [url, svg] = mocks.write.mock.calls[i]!
    expect(url.pathname).toMatch(/(?:memory-footprint|file-size)\.svg$/)
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
    expect(dom.window.document.documentElement.getAttribute('role')).toBe('img')
    expect(dom.window.document.querySelector('title')?.textContent).toBeTruthy()
    const bars = dom.window.document.querySelectorAll('rect[height="2"]')
    expect(bars.length).toBeGreaterThan(0)
    for (let j = 0, count = bars.length; j < count; j += 1) {
      expect(Number(bars[j]!.getAttribute('width'))).toBeGreaterThan(0)
    }
    dom.window.close()
  }
  expect(mocks.refresh).toHaveBeenCalledOnce()
})

test.each(['runtime', 'measurement'])(
  'rejects invalid %s inputs',
  async kind => {
    const actual = await vi.importActual<typeof Fs>('node:fs')
    vi.doMock('node:fs', () => ({
      ...actual,
      writeFileSync: mocks.write,
      readFileSync: (file: Parameters<typeof actual.readFileSync>[0]) => {
        const text = actual.readFileSync(file, 'utf8')
        if (!String(file).endsWith('memory-footprint.json')) {
          return text
        }
        const data = JSON.parse(text)
        if (kind === 'runtime') {
          data.metadata.runtime = 'Node.js'
        } else {
          data.rows[0].initialized.median = 0
        }
        return JSON.stringify(data)
      },
    }))
    await expect(
      import('../../../../scripts/repo/gen/footprint-charts.mts'),
    ).rejects.toThrow()
    expect(mocks.write).not.toHaveBeenCalled()
    vi.doUnmock('node:fs')
  },
)
