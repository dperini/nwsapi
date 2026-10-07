import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  chart: vi.fn<(...args: unknown[]) => string>(() => '<svg/>'),
  ratio: vi.fn(() => 2),
}))
vi.mock('node:fs', () => ({
  readFileSync: mocks.read,
  writeFileSync: mocks.write,
}))
vi.mock('../../../../scripts/repo/bench/charts.mts', () => ({
  chart: mocks.chart,
}))
vi.mock('../../../../scripts/repo/bench/summary-chart.mts', () => ({
  geometricSpeedup: mocks.ratio,
}))
import { writeJsdomBenchmark } from '../../../../scripts/repo/gen/jsdom-benchmark.mts'
const selectors = [
  '.card',
  '[data-testid]',
  'input:read-write',
  '.card:has(> input) > button',
]
beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockImplementation(file =>
    String(file).endsWith('.json')
      ? JSON.stringify({
          metadata: {
            node: '26',
            jsdomVersion: '29',
            installations: [{ selector: 'nwsapi', version: '3' }],
          },
          rows: selectors.map(selector => ({ selector })),
        })
      : '<!-- jsdom-summary:start --><!-- jsdom-summary:end -->',
  )
})
test.each([2, 0.5])(
  'selects public query cases and writes chart for ratio %s',
  ratio => {
    mocks.ratio.mockReturnValue(ratio)
    writeJsdomBenchmark()
    expect(mocks.chart.mock.calls[0]?.[2]).toEqual(
      selectors.map(selector => ({ selector })),
    )
    expect(mocks.write).toHaveBeenCalledTimes(2)
    expect(mocks.write.mock.calls[0]).toEqual([
      'assets/repo/bench/jsdom-override.svg',
      '<svg/>',
    ])
  },
)
test('rejects a document without insertion boundaries', () => {
  mocks.read.mockImplementation(file =>
    String(file).endsWith('.json')
      ? JSON.stringify({
          metadata: { installations: [] },
          rows: selectors.map(selector => ({ selector })),
        })
      : '',
  )
  expect(writeJsdomBenchmark).toThrow()
  expect(mocks.write).toHaveBeenCalledTimes(1)
})

test('CLI entry point writes both artifacts', async () => {
  vi.resetModules()
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
  }))
  await import('../../../../scripts/repo/gen/jsdom-benchmark.mts')
  expect(mocks.write).toHaveBeenCalledTimes(2)
  vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
})
