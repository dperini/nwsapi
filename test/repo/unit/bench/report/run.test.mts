import assert from 'node:assert/strict'
import type * as fs from 'node:fs'
import type * as util from 'node:util'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: {
    output: '/fixture/report',
    rounds: '2',
    iterations: '4',
    'min-round-ms': '10',
    'cold-count': '2',
    help: false,
  },
  write: vi.fn(),
  mkdir: vi.fn(),
  launch: vi.fn(),
  close: vi.fn(),
  page: vi.fn(),
  pageClose: vi.fn(),
  charts: vi.fn(),
  timing: vi.fn(),
  sources: vi.fn(),
}))
vi.mock('node:util', async importOriginal => ({
  ...(await importOriginal<typeof util>()),
  parseArgs: () => ({ values: state.values }),
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof fs>()),
  mkdirSync: state.mkdir,
  writeFileSync: state.write,
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: state.launch } }))
vi.mock('../../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    components: { html: () => '<body><i></i></body>' },
    documentation: { html: () => '<body><p></p></body>' },
  },
  components: () => '<body><i></i></body>',
}))
vi.mock('../../../../../scripts/repo/bench/cases.mts', () => ({
  cases: {
    components: { identifiers: ['i', '.a'] },
    documentation: { documentation: ['p'] },
  },
}))
vi.mock('../../../../../scripts/repo/bench/chart-report.mts', () => ({
  writeBenchmarkCharts: state.charts,
}))
vi.mock('../../../../../scripts/repo/bench/native/host.mts', () => ({
  nativePage: state.page,
  nativeSources: state.sources,
}))
vi.mock('../../../../../scripts/repo/bench/native/timing.mts', () => ({
  nativeTiming: state.timing,
}))
afterEach(() => vi.clearAllMocks())

async function execute(failure: 'none' | 'warm' | 'cold' = 'none') {
  vi.resetModules()
  state.sources.mockResolvedValue({ competitorBundleSha256: 'bundle' })
  state.launch.mockResolvedValue({
    close: state.close,
    version: () => 'test-version',
  })
  state.page.mockResolvedValue({ close: state.pageClose })
  state.timing.mockImplementation(async (_page, options) => ({
    consumed: 8,
    rows: options.selectors.map(
      ({ selector, category }: { selector: string; category: string }) => ({
        category,
        selector,
        milliseconds: [1, 2],
        cold: [3, 4],
        samples: [[1], [2]],
        coldSamples: [[3], [4]],
        sampleIterations: [[4], [4]],
        errors:
          failure === (options.first ? 'cold' : 'warm')
            ? ['mismatch', null]
            : [null, null],
      }),
    ),
  }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../../../../../scripts/repo/bench/report/run.mts')
}

test('browser report runner records all-results and cold first-query measurements with separate metadata', async () => {
  state.values.help = false
  await execute()
  assert.equal(state.timing.mock.calls.length, 3)
  assert.deepEqual(
    state.timing.mock.calls.map(call => call[1].first),
    [false, false, true],
  )
  assert.equal(state.charts.mock.calls.length, 2)
  assert.equal(state.pageClose.mock.calls.length, 3)
  assert.equal(state.close.mock.calls.length, 1)
  const reports = state.write.mock.calls.map(([file, json]) => ({
    file,
    report: JSON.parse(json),
  }))
  assert.equal(reports.length, 3)
  assert.equal(reports[0]!.file, '/fixture/report/results.json')
  assert.equal(reports[1]!.file, '/fixture/report/documentation/results.json')
  assert.equal(reports[0]!.report.metadata.fixture, 'components')
  assert.equal(reports[0]!.report.metadata.rounds, 2)
  assert.equal(reports[2]!.report.metadata.host, 'native browser DOM; no jsdom')
  assert.deepEqual(reports[2]!.report.rows[0].warm, [1, 2])
  assert.deepEqual(reports[2]!.report.rows[0].cold, [3, 4])
})

test('browser report runner closes pages and browser after wrong warm or cold results', async () => {
  state.values.help = false
  await assert.rejects(execute('warm'))
  assert.equal(state.pageClose.mock.calls.length, 1)
  assert.equal(state.close.mock.calls.length, 1)
  vi.clearAllMocks()
  await assert.rejects(execute('cold'))
  assert.equal(state.pageClose.mock.calls.length, 3)
  assert.equal(state.close.mock.calls.length, 1)
})

test('browser report help avoids collection and tool startup', async () => {
  state.values.help = true
  await execute()
  assert.equal(state.sources.mock.calls.length, 0)
  assert.equal(state.launch.mock.calls.length, 0)
  assert.equal(state.write.mock.calls.length, 0)
  state.values.help = false
})
