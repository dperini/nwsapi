import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
const state = vi.hoisted(() => ({
  exists: false,
  main: false,
  disagree: false,
  write: vi.fn(),
  measure: vi.fn(),
  settings: { rounds: 0, milliseconds: 0 },
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: vi.fn(),
  readFileSync: () => 'baseline',
  writeFileSync: state.write,
}))
vi.mock('../../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/adaptive/collect.mts'),
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ jsdom: 'fixture' }),
  sha256: () => 'hash',
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/fixtures.mts',
  () => ({ fixtures: () => [{ id: 'one', family: 'class', split: 'train' }] }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/variants.mts',
  () => ({ baselinePath: () => '/fixture/baseline' }),
)
vi.mock('../../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => 'AC',
}))
vi.mock('../../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  settings: state.settings,
  measureBrowser: async (...args: unknown[]) => ({
    rows: await state.measure(...args),
    version: 'fixture',
  }),
  measureJsdom: state.measure,
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/adaptive/variants.mts',
  () => ({
    adaptiveNames: ['baseline', 'adaptive'],
    adaptiveVariants: () => ['baseline', 'adaptive'],
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/adaptive/evidence.mts',
  () => ({
    nativeObservations: async () => [{ features: [1] }],
    nodeObservations: () => [{ features: state.disagree ? [2] : [1] }],
  }),
)
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.exists = false
  state.main = false
  state.disagree = false
  state.write.mockClear()
  state.measure.mockReset().mockResolvedValue([{ id: 'one', costs: [2, 1] }])
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
})
async function module() {
  return import('../../../../../../scripts/repo/bench/planner/adaptive/collect.mts')
}
test('freezes fixtures variants and matching host observations', async () => {
  await (await module()).collectAdaptive('/fixture/output', 4)
  const experiment = JSON.parse(state.write.mock.calls[0]![1])
  expect(experiment.prefix).toBe(4)
  expect(experiment.split).toEqual([
    { id: 'one', group: 'class', split: 'train' },
  ])
  const fixture = state.write.mock.calls.find(([file]) =>
    file.endsWith('fixtures.json.gz'),
  )!
  expect(JSON.parse(gunzipSync(fixture[1]).toString())).toHaveLength(1)
  const hosts = state.write.mock.calls.filter(([file]) =>
    file.endsWith('-training.json'),
  )
  expect(hosts).toHaveLength(2)
  expect(
    hosts.map(([, data]) => JSON.parse(data).rows[0].observations),
  ).toEqual([[1], [1]])
  expect(state.settings).toEqual({ rounds: 11, milliseconds: 20 })
})
test.each(['exists', 'prefix', 'disagree'])(
  'rejects unsafe collection %s',
  async mode => {
    state.exists = mode === 'exists'
    state.disagree = mode === 'disagree'
    await expect(
      (await module()).collectAdaptive(
        '/fixture/output',
        mode === 'prefix' ? 3 : 4,
      ),
    ).rejects.toBeInstanceOf(Error)
  },
)
test.each([
  { args: ['--help'], fails: false },
  { args: [], fails: true },
  { args: ['/fixture/output'], fails: false },
  { args: ['/fixture/output', '8'], fails: false },
])('handles CLI %j', async ({ args, fails }) => {
  state.main = true
  process.argv = [argv[0]!, 'collect.mts', ...args]
  if (fails) {
    await expect(module()).rejects.toBeInstanceOf(Error)
  } else {
    await module()
  }
})
