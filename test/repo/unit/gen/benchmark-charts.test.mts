import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ write: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../../scripts/repo/bench/chart-report.mts', () => ({
  writeBenchmarkCharts: mocks.write,
}))
vi.mock('../../../../scripts/repo/gen/chart-references.mts', () => ({
  refreshChartReferences: mocks.refresh,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

test('regenerates all three benchmark groups from recorded measurements', async () => {
  await import('../../../../scripts/repo/gen/benchmark-charts.mts')
  expect(mocks.write).toHaveBeenCalledTimes(3)
  const groups = mocks.write.mock.calls.map(([directory, metadata, rows]) => {
    expect(metadata.runtime).toMatch(/^Chromium/)
    expect(rows.length).toBeGreaterThan(0)
    return directory.split('/').at(-1)
  })
  expect(groups).toEqual(['bench', 'documentation', 'atomic'])
  expect(mocks.refresh).toHaveBeenCalledOnce()
})
