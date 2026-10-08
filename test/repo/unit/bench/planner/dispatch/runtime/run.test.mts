import assert from 'node:assert/strict'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { test, vi } from 'vitest'
import {
  invokeMainModule,
  missingMainArguments,
} from '../../../main-module.mts'
const state = vi.hoisted(() => ({
  exists: false,
  mismatch: false,
  missing: false,
  choose: true,
  writes: vi.fn(),
  settings: { rounds: 0, milliseconds: 0 },
}))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: vi.fn(),
  writeFileSync: state.writes,
  readFileSync: (file: string) =>
    file.endsWith('.gz') ? gzipSync('build') : Buffer.from('build'),
}))
vi.mock('../../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ jsdom: 'fixture' }),
  sha256: (value: string) => value.length,
}))
vi.mock(
  '../../../../../../../scripts/repo/bench/planner/has/power.mts',
  () => ({ checkedPower: () => 'AC' }),
)
vi.mock(
  '../../../../../../../scripts/repo/bench/planner/has/instrument.mts',
  () => ({ routeBundle: (source: string) => source }),
)
vi.mock(
  '../../../../../../../scripts/repo/bench/planner/dispatch/crossed.mts',
  () => ({
    crossedFixtures: () => [
      { id: 'older', plannerFeatures: [0, 0, 0] },
      { id: 'crossed-0-ignore', plannerFeatures: [0, 0, 0] },
      ...[32, 96, 192].map((count, index) => ({
        id: `crossed-4-${count}-4-3`,
        plannerFeatures: [0, 0, index === 0 ? 0 : 1],
      })),
    ],
  }),
)
vi.mock(
  '../../../../../../../scripts/repo/bench/planner/dispatch/diagnostic.mts',
  () => ({
    diagnosticFixtures: () => [
      { id: 'diagnostic-one', plannerFeatures: [0, 0, 0] },
    ],
  }),
)
vi.mock('../../../../../../../scripts/repo/bench/planner/measure.mts', () => {
  const measure = async (entries: Array<{ id: string }>) =>
    entries.map(entry => ({
      id: entry.id,
      features: [0, 0, 0],
      costs: [4, 3, 2, 1],
      samples: [[4], [3], [2], [1]],
      calls: [4, 3, 2, 1],
    }))
  return {
    settings: state.settings,
    measureBrowser: async (entries: Array<{ id: string }>) => ({
      version: 'fixture',
      rows: await measure(entries),
    }),
    measureJsdom: measure,
  }
})
vi.mock(
  '../../../../../../../scripts/repo/bench/planner/has/evidence.mts',
  () => {
    const evidence = (
      entries: Array<{ id: string; plannerFeatures: number[] }>,
      _sources: string[],
      verify: (row: unknown) => void,
    ) =>
      entries.map((entry, probe) => {
        const facts = {
          eligible: true,
          anchors: 32,
          witnesses: probe === 2 ? 1 : 100,
          denseInverse: false,
          weakMapAvailable: true,
        }
        const original = probe === 2 ? 'inverse' : 'forward'
        const route =
          original === 'forward' && entry.plannerFeatures[2] && state.choose
            ? 'inverse'
            : original
        const row = {
          id: entry.id,
          traces: [0, 1, 2, 3].map(index => ({
            facts: state.missing ? undefined : facts,
            route:
              state.mismatch && index === 3
                ? 'bad'
                : index >= 2
                  ? route
                  : original,
          })),
        }
        verify(row)
        return row
      })
    return {
      browserEvidence: async (...args: Parameters<typeof evidence>) =>
        evidence(...args),
      jsdomEvidence: evidence,
    }
  },
)
async function load() {
  return import('../../../../../../../scripts/repo/bench/planner/dispatch/runtime/run.mts')
}
for (const host of ['chromium', 'jsdom']) {
  vi.doMock(
    path.resolve(
      'assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1',
      `${host}.mjs`,
    ),
    () => ({ dispatchOverride: () => state.choose }),
  )
}

test('runtime measurement verifies routing and preserves canonical result order for repeated runs', async () => {
  const { runtime } = await load()
  for (let index = 0, length = 2; index < length; index += 1) {
    state.writes.mockClear()
    state.choose = !index
    await runtime(
      index ? 'uncached.gz' : 'uncached.cjs',
      'cached.gz',
      '/output',
      !!index,
    )
    const reports = state.writes.mock.calls.filter(args =>
      String(args[0]).endsWith('.json'),
    )
    assert.equal(reports.length, 2)
    const report = JSON.parse(reports[0]![1])
    assert.equal(report.metadata.repeat, !!index)
    assert.equal(report.metadata.settings.milliseconds, index ? 16 : 12)
    assert.equal(report.rows.length, 5)
    assert.deepEqual(report.rows[0].costs, index ? [1, 2, 3, 4] : [4, 3, 2, 1])
    assert.equal(report.summaries.all.length, 4)
    assert.equal(report.summaries.older[0].cases, 1)
    assert.equal(report.summaries.crossed[0].cases, 3)
    assert.equal(report.summaries.diagnostic[0].cases, 1)
    assert.equal(report.summaries.unfiltered[0].cases, 5)
    const fixtureWrite = state.writes.mock.calls.find(args =>
      String(args[0]).endsWith('fixtures.json.gz'),
    )!
    const entries = JSON.parse(gunzipSync(fixtureWrite[1]).toString())
    assert.equal(entries[0].id, index ? 'diagnostic-one' : 'older')
  }
  state.exists = true
  await assert.rejects(runtime('a', 'b', '/exists'), { code: 'ERR_ASSERTION' })
  state.exists = false
  for (const flag of ['missing', 'mismatch'] as const) {
    state[flag] = true
    await assert.rejects(runtime('a', 'b', '/output'), {
      code: 'ERR_ASSERTION',
    })
    state[flag] = false
  }
})

test('runtime CLI accepts repetition and validates each required argument', async () => {
  await invokeMainModule(load, ['--help'], '/runtime/run.mts')
  await missingMainArguments(
    load,
    [[], ['a'], ['a', 'b'], ['a', 'b', 'out', 'invalid']],
    '/runtime/run.mts',
  )
  await invokeMainModule(load, ['a', 'b', 'out', 'repeat'], '/runtime/run.mts')
})
