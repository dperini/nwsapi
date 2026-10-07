import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
const state = vi.hoisted(() => ({
  exists: false,
  occupied: false,
  mismatch: false,
  write: vi.fn(),
  measure: vi.fn(),
  settings: { rounds: 7, milliseconds: 12 },
  entries: [
    { id: 'train', family: 'flat', split: 'train' },
    { id: 'held', family: 'tree', split: 'holdout' },
  ],
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  readdirSync: () => (state.occupied ? ['old'] : []),
  mkdirSync: vi.fn(),
  writeFileSync: state.write,
  readFileSync: (file: string) =>
    file.endsWith('fixtures.json.gz')
      ? gzipSync(JSON.stringify(state.entries))
      : file.endsWith('shared-model.json')
        ? JSON.stringify({
            baseline: { candidateSha256: state.mismatch ? 'wrong' : 'hash' },
          })
        : 'fixture',
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ jsdom: 'fixture' }),
  sha256: () => 'hash',
}))
vi.mock('../../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  settings: state.settings,
  assertRoutes: vi.fn(),
  measureBrowser: async (...args: unknown[]) => ({
    rows: await state.measure(...args),
    version: 'fixture',
  }),
  measureJsdom: state.measure,
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/fixtures.mts',
  () => ({ fixtures: () => state.entries }),
)
vi.mock('../../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => 'AC',
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/contract.mts',
  () => ({ contractVersion: 1, contractVectors: () => [1] }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/evidence.mts',
  () => ({
    browserEvidence: async (entries: Array<{ id: string }>) =>
      entries.map(entry => ({ id: entry.id })),
    jsdomEvidence: (entries: Array<{ id: string }>) =>
      entries.map(entry => ({ id: entry.id })),
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/variants.mts',
  () => ({
    baselinePath: () => '/fixture/baseline',
    probeSource: () => 'probe',
    instrumentedVariants: () => ['instrumented'],
    variants: () => ['rule', 'trained'],
    confirmationVariants: () => ['rule', 'confirmation'],
    preflightVariants: () => ['rule', 'preflight'],
  }),
)
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.exists = false
  state.occupied = false
  state.mismatch = false
  state.write.mockClear()
  state.settings = Object.assign(state.settings, {
    rounds: 7,
    milliseconds: 12,
  })
  state.measure
    .mockReset()
    .mockImplementation(async (entries: Array<{ id: string }>) =>
      entries.map(entry => ({ ...entry, costs: [2, 1] })),
    )
  vi.stubEnv('NWSAPI_PLANNER_ROUNDS', '')
  vi.stubEnv('NWSAPI_PLANNER_MILLISECONDS', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
async function run(phase: string, pass?: string) {
  process.argv = [
    argv[0]!,
    'run.mts',
    phase,
    '/fixture/output',
    ...(pass ? [pass] : []),
  ]
  await import('../../../../../../scripts/repo/bench/planner/has/run.mts')
}
test.each(['collect', 'evaluate', 'preflight', 'confirm', 'repeat'])(
  'persists validated phase %s with frozen cases',
  async phase => {
    if (phase === 'collect') {
      state.exists = true
    }
    await run(
      phase === 'repeat' ? 'confirm' : phase,
      phase === 'repeat' ? 'repeat' : undefined,
    )
    const measurements = state.write.mock.calls.filter(([file]) =>
      /-(training|evaluation|preflight|confirmation)(-repeat)?\.json$/.test(
        file,
      ),
    )
    expect(measurements).toHaveLength(2)
    const report = JSON.parse(measurements[0]![1])
    expect(report.rows.map((row: { id: string }) => row.id)).toEqual(
      phase === 'repeat'
        ? ['held', 'train']
        : phase === 'collect' || phase === 'confirm'
          ? ['train', 'held']
          : ['held'],
    )
    expect(report.metadata.powerAfter).toBe('AC')
    expect(report.rows[0].routeEvidence).toEqual(
      phase === 'collect' ? { id: 'train' } : undefined,
    )
    if (phase === 'repeat') {
      expect(state.settings).toEqual({ rounds: 11, milliseconds: 24 })
    }
  },
)
test('accepts bounded explicit timing settings', async () => {
  vi.stubEnv('NWSAPI_PLANNER_ROUNDS', '2')
  vi.stubEnv('NWSAPI_PLANNER_MILLISECONDS', '3')
  await run('confirm')
  expect(state.settings).toEqual({ rounds: 2, milliseconds: 3 })
})
test.each([
  { name: 'NWSAPI_PLANNER_ROUNDS', value: '0' },
  { name: 'NWSAPI_PLANNER_ROUNDS', value: '101' },
  { name: 'NWSAPI_PLANNER_ROUNDS', value: '1.5' },
  { name: 'NWSAPI_PLANNER_MILLISECONDS', value: '0' },
  { name: 'NWSAPI_PLANNER_MILLISECONDS', value: '3600001' },
  { name: 'NWSAPI_PLANNER_MILLISECONDS', value: 'NaN' },
])('rejects invalid timing %j', async ({ name, value }) => {
  vi.stubEnv(name, value)
  await expect(run('collect')).rejects.toBeInstanceOf(Error)
  expect(state.measure).not.toHaveBeenCalled()
})
test('rejects a nonempty prior collection', async () => {
  state.exists = true
  state.occupied = true
  await expect(run('collect')).rejects.toBeInstanceOf(Error)
})
test('rejects runtime mismatch in trained evaluation', async () => {
  state.mismatch = true
  await expect(run('evaluate')).rejects.toBeInstanceOf(Error)
})
test.each([
  { phase: 'unknown', pass: undefined },
  { phase: 'collect', pass: 'repeat' },
  { phase: 'confirm', pass: 'wrong' },
])('rejects invalid phase or pass %j', async ({ phase, pass }) => {
  await expect(run(phase, pass)).rejects.toBeInstanceOf(Error)
})
test('requires output directory', async () => {
  process.argv = [argv[0]!, 'run.mts', 'collect']
  await expect(
    import('../../../../../../scripts/repo/bench/planner/has/run.mts'),
  ).rejects.toBeInstanceOf(Error)
})
