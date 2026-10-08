import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { test, vi } from 'vitest'
import { invokeMainModule, missingMainArguments } from '../../main-module.mts'
const state = vi.hoisted(() => ({
  exists: false,
  saved: false,
  mismatch: false,
  previous: '',
  writes: vi.fn(),
  exported: vi.fn(),
  evidence: vi.fn(),
  settings: { rounds: 0, milliseconds: 0 },
}))
vi.mock('node:fs', () => ({
  existsSync: (file: string) =>
    file.endsWith('-training.json') ? state.saved : state.exists,
  mkdirSync: vi.fn(),
  writeFileSync: state.writes,
  readFileSync: (file: string) =>
    file.endsWith('experiment.json')
      ? state.mismatch
        ? '{}'
        : state.previous
      : 'build',
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ jsdom: 'fixture' }),
  sha256: () => 'hash',
}))
vi.mock('../../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => 'AC',
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/variants.mts',
  () => ({
    baselinePath: () => '/baseline',
    variants: () => ['baseline', 'forward', 'inverse'],
    instrumentedVariants: () => ['trace'],
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/neural/export.mts',
  () => ({ exportDataset: state.exported }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts',
  () => ({
    fixtures: () =>
      Array.from({ length: 9 }, (_, index) => ({
        id: `template-${index}`,
        family: 'train',
      })),
    split: (family: string) => family,
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/expanded.mts',
  () => ({
    expandedFixtures: () => [{ id: 'expanded', family: 'validation' }],
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/crossed.mts',
  () => ({ crossedFixtures: () => [{ id: 'crossed', family: 'evaluation' }] }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/evidence.mts',
  () => ({
    browserEvidence: async (entries: Array<{ id: string }>) =>
      entries.map(entry => ({ id: entry.id })),
    jsdomEvidence: (entries: Array<{ id: string }>) => {
      state.evidence(entries)
      return entries.map(entry => ({ id: entry.id }))
    },
  }),
)
vi.mock('../../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  settings: state.settings,
  measureBrowser: async (entries: Array<{ id: string }>) => ({
    version: 'fixture',
    rows: entries,
  }),
  measureJsdom: async (entries: Array<{ id: string }>) => entries,
}))
async function load() {
  return import('../../../../../../scripts/repo/bench/planner/dispatch/collect.mts')
}

test('collection records fixture splits, attaches route evidence and resumes only unchanged inputs', async () => {
  const { collect } = await load()
  for (let index = 0, length = 3; index < length; index += 1) {
    state.writes.mockClear()
    await collect('/output', false, index === 1, index === 2)
    const entries = JSON.parse(
      gunzipSync(state.writes.mock.calls[0]![1]).toString(),
    )
    assert.equal(
      entries[0].id,
      index === 0 ? 'template-0' : index === 1 ? 'expanded' : 'crossed',
    )
    const report = state.writes.mock.calls.find(args =>
      String(args[0]).endsWith('experiment.json'),
    )!
    state.previous = report[1]
    const metadata = JSON.parse(state.previous)
    assert.equal(metadata.settings.rounds, 11)
    assert.equal(metadata.split.length, entries.length)
    const host = state.writes.mock.calls.find(args =>
      String(args[0]).endsWith('jsdom-training.json'),
    )!
    const rows = JSON.parse(host[1]).rows
    assert.deepEqual(
      rows.map(
        (row: { id: string; routeEvidence: { id: string } }) =>
          row.routeEvidence.id,
      ),
      entries.map((entry: { id: string }) => entry.id),
    )
    await collect('/output', true, index === 1, index === 2)
  }
  assert.deepEqual(state.evidence.mock.calls[0]![0].length, 8)
  assert.equal(state.evidence.mock.calls[1]![0].length, 1)
  state.exists = true
  await assert.rejects(collect('/output'))
  state.saved = true
  state.writes.mockClear()
  await collect('/output', true, false, true)
  assert.equal(
    state.writes.mock.calls.some(args =>
      String(args[0]).endsWith('-training.json'),
    ),
    false,
  )
  state.mismatch = true
  await assert.rejects(collect('/output', true, false, true), {
    code: 'ERR_ASSERTION',
  })
  state.mismatch = false
  state.exists = false
  state.saved = false
  assert.ok(state.exported.mock.calls.length >= 7)
})

test('collection CLI supports all modes and rejects unknown modes', async () => {
  await invokeMainModule(load, ['--help'], '/dispatch/collect.mts')
  await missingMainArguments(
    load,
    [[], ['out', 'invalid']],
    '/dispatch/collect.mts',
  )
  await invokeMainModule(load, ['out'], '/dispatch/collect.mts')
  state.previous = state.writes.mock.calls.findLast(args =>
    String(args[0]).endsWith('experiment.json'),
  )![1]
  await invokeMainModule(load, ['out', 'resume'], '/dispatch/collect.mts')
  await invokeMainModule(load, ['out', 'expanded'], '/dispatch/collect.mts')
  state.previous = state.writes.mock.calls.findLast(args =>
    String(args[0]).endsWith('experiment.json'),
  )![1]
  await invokeMainModule(
    load,
    ['out', 'resume-expanded'],
    '/dispatch/collect.mts',
  )
  await invokeMainModule(load, ['out', 'crossed'], '/dispatch/collect.mts')
  state.previous = state.writes.mock.calls.findLast(args =>
    String(args[0]).endsWith('experiment.json'),
  )![1]
  await invokeMainModule(
    load,
    ['out', 'resume-crossed'],
    '/dispatch/collect.mts',
  )
})
