import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { gzipSync, gunzipSync } from 'node:zlib'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  measure: vi.fn(),
  fit: vi.fn(),
  mismatch: false,
  settings: { rounds: 1 },
  entries: [
    { id: 'train', split: 'train' },
    { id: 'held', split: 'holdout' },
  ],
}))
vi.mock('node:child_process', () => ({ execFileSync: () => 'AC\n' }))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: state.write,
  readFileSync: (file: string | URL) =>
    String(file).endsWith('fixtures.json.gz')
      ? gzipSync(JSON.stringify(state.entries))
      : String(file).endsWith('shared-model.json')
        ? JSON.stringify({
            model: {},
            domain: {},
            baseline: { candidateSha256: state.mismatch ? 'wrong' : 'hash' },
          })
        : 'fixture',
}))
vi.mock('../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ candidateSha256: 'hash', jsdom: 'fixture' }),
  sha256: () => 'hash',
}))
vi.mock('../../../../../scripts/repo/bench/planner/fixtures.mts', () => ({
  fixtures: () => state.entries,
}))
vi.mock('../../../../../scripts/repo/bench/planner/fit.mts', () => ({
  fit: state.fit,
}))
vi.mock('../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  assertRoutes: vi.fn(),
  settings: state.settings,
  measureBrowser: async (...args: unknown[]) => ({
    rows: await state.measure(...args),
    version: 'fixture',
  }),
  measureJsdom: state.measure,
}))
vi.mock('../../../../../scripts/repo/bench/planner/model.mts', () => ({
  train: () => ({ model: true }),
  expression: () => 'fixture',
  decide: (_model: unknown, features: number[]) => features[0] === 1,
}))
vi.mock('../../../../../scripts/repo/bench/planner/variants.mts', () => ({
  variants: () => ['rule', 'narrow', 'broad'],
}))
const argv = process.argv.slice()
const originalProcess = process
beforeEach(() => {
  vi.resetModules()
  state.mismatch = false
  state.write.mockClear()
  state.fit.mockClear()
  state.measure
    .mockReset()
    .mockImplementation(async (entries: Array<{ id: string; split: string }>) =>
      entries.map((entry, index) => ({
        ...entry,
        features: [index],
        costs: [3, 2, 1],
      })),
    )
})
afterEach(() => {
  originalProcess.argv = argv
  vi.unstubAllGlobals()
})
async function run(phase: string, platform = 'darwin') {
  originalProcess.argv = [argv[0]!, 'planner/run.mts', phase, '/fixture/output']
  vi.stubGlobal(
    'process',
    new Proxy(originalProcess, {
      get: (target, key) =>
        key === 'platform' ? platform : Reflect.get(target, key),
    }),
  )
  await import('../../../../../scripts/repo/bench/planner/run.mts')
}
test('collects frozen training and routes predictions to selected costs', async () => {
  await run('collect')
  const frozen = state.write.mock.calls.find(([file]) =>
    file.endsWith('fixtures.json.gz'),
  )!
  expect(JSON.parse(gunzipSync(frozen[1]).toString())).toEqual(state.entries)
  const training = state.write.mock.calls.filter(([file]) =>
    file.endsWith('-training.json'),
  )
  expect(training).toHaveLength(2)
  expect(
    JSON.parse(training[0]![1]).predictions.map(
      (row: { selectedNs: number }) => row.selectedNs,
    ),
  ).toEqual([2, 1])
  expect(state.fit).toHaveBeenCalledWith('/fixture/output')
})
test('evaluates only frozen holdout rows without refitting', async () => {
  await run('evaluate', 'linux')
  const evaluation = state.write.mock.calls.filter(([file]) =>
    file.endsWith('-evaluation.json'),
  )
  expect(evaluation).toHaveLength(2)
  expect(
    JSON.parse(evaluation[0]![1]).rows.map((row: { id: string }) => row.id),
  ).toEqual(['held'])
  expect(JSON.parse(evaluation[0]![1]).metadata.power).toBe('unknown')
  expect(state.fit).not.toHaveBeenCalled()
})
test('rejects model inputs from a different runtime build', async () => {
  state.mismatch = true
  await expect(run('evaluate')).rejects.toBeInstanceOf(Error)
  expect(state.measure).not.toHaveBeenCalled()
})
test.each(['missing', 'unknown'])('rejects invalid phase %s', async mode => {
  originalProcess.argv = [
    argv[0]!,
    'planner/run.mts',
    ...(mode === 'missing' ? [] : ['wrong', '/fixture/output']),
  ]
  await expect(
    import('../../../../../scripts/repo/bench/planner/run.mts'),
  ).rejects.toBeInstanceOf(Error)
})
