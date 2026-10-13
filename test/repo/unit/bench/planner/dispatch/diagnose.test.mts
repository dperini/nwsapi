import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, test, vi } from 'vitest'
import { invokeMainModule, missingMainArguments } from '../../main-module.mts'
const state = vi.hoisted(() => ({
  exists: false,
  fault: false,
  choose: true,
  writes: vi.fn(),
  settings: { rounds: 0, milliseconds: 0 },
}))
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')
let modelDirectory = ''
const fixtureChoiceKey = 'NWSAPI_DISPATCH_DIAGNOSE_CHOICE'
const originalFixtureChoice = process.env[fixtureChoiceKey]
beforeAll(() => {
  modelDirectory = actualFs.mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-dispatch-diagnose-model-'),
  )
  const source = `export function dispatchOverride() { return process.env.${fixtureChoiceKey} === 'true' }\n`
  for (const name of ['chromium', 'jsdom', 'chromium-rule', 'jsdom-rule']) {
    actualFs.writeFileSync(path.join(modelDirectory, `${name}.mjs`), source)
  }
})
afterAll(() => {
  if (originalFixtureChoice === undefined) {
    delete process.env[fixtureChoiceKey]
  } else {
    process.env[fixtureChoiceKey] = originalFixtureChoice
  }
  actualFs.rmSync(modelDirectory, { recursive: true, force: true })
})
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  mkdirSync: vi.fn(),
  writeFileSync: state.writes,
  readFileSync: (file: string) =>
    file.endsWith('evaluation.json')
      ? JSON.stringify({
          results: {
            chromium: { modelSha256: 'hash', ruleSha256: 'hash' },
            jsdom: { modelSha256: 'hash', ruleSha256: 'hash' },
          },
        })
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
  () => ({ baselinePath: () => '/baseline' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/instrument.mts',
  () => ({ routeBundle: () => 'route' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/variants.mts',
  () => ({ dispatchBundle: () => 'dispatch' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/specialize.mts',
  () => ({
    splitDispatchBundle: () => 'split',
    unfilteredCertificate: () => ({ anchorUpperBound: 192 }),
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/crossed.mts',
  () => ({
    crossedFixtures: () =>
      [
        'crossed-7-192-4-0',
        'crossed-7-96-4-0',
        'crossed-7-192-2.5-0',
        'crossed-unused',
      ].map(id => ({ id, family: 'crossed' })),
  }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/diagnostic.mts',
  () => ({
    diagnosticFixtures: () =>
      Array.from({ length: 9 }, (_, index) => ({
        id: `diagnostic-${index}`,
        family: 'fresh',
      })),
  }),
)
vi.mock('../../../../../../scripts/repo/bench/planner/measure.mts', () => {
  const measure = async (entries: Array<{ id: string; family: string }>) =>
    entries.map((entry, index) => ({
      ...entry,
      features: [32, 100, index % 2, 3.125],
      costs: [6, 5, 4, 3, 2, 1],
    }))
  return {
    settings: state.settings,
    measureBrowser: async (entries: Array<{ id: string; family: string }>) => ({
      version: 'fixture',
      rows: await measure(entries),
    }),
    measureJsdom: measure,
  }
})
vi.mock('../../../../../../scripts/repo/bench/planner/has/evidence.mts', () => {
  const evidence = (
    entries: Array<{ id: string }>,
    _sources: string[],
    verify: (row: unknown) => void,
  ) =>
    entries.map((entry, probe) => {
      const facts =
        probe === 0
          ? undefined
          : {
              eligible: true,
              anchors: 32,
              witnesses: probe === 3 ? 1 : 100,
              denseInverse: false,
              weakMapAvailable: true,
            }
      const features = probe === 2 ? undefined : [32, 100, 1, 3.125]
      const original = !facts
        ? 'ineligible'
        : probe === 3
          ? 'inverse'
          : 'forward'
      const traces = [0, 1, 2, 3, 4, 5].map(index => ({
        facts,
        features,
        route: state.fault
          ? 'bad'
          : index >= 3 && original === 'forward' && features && state.choose
            ? 'inverse'
            : original,
      }))
      const row = { id: entry.id, traces }
      verify(row)
      return row
    })
  return {
    browserEvidence: async (...args: Parameters<typeof evidence>) =>
      evidence(...args),
    jsdomEvidence: evidence,
  }
})
async function load() {
  return import('../../../../../../scripts/repo/bench/planner/dispatch/diagnose.mts')
}

test('diagnosis records fresh and reproduction summaries with verified model and split routing', async () => {
  const { diagnose } = await load()
  for (let index = 0, length = 2; index < length; index += 1) {
    state.writes.mockClear()
    state.choose = !index
    process.env[fixtureChoiceKey] = String(state.choose)
    await diagnose(modelDirectory, '/output', !!index)
    const entries = JSON.parse(
      gunzipSync(state.writes.mock.calls[0]![1]).toString(),
    )
    assert.equal(entries.length, 12)
    assert.equal(entries[0].id, index ? 'crossed-7-192-2.5-0' : 'diagnostic-0')
    const report = JSON.parse(
      state.writes.mock.calls.find(args =>
        String(args[0]).endsWith('chromium.json'),
      )![1],
    )
    assert.equal(report.metadata.settings.milliseconds, index ? 24 : 20)
    assert.equal(report.summaries.fresh[0].cases, 9)
    assert.equal(report.summaries.reproduction[0].cases, 3)
    assert.equal(
      report.summaries.filtered[0].cases + report.summaries.unfiltered[0].cases,
      9,
    )
    assert.equal(report.metadata.variants.length, 6)
    assert.equal(report.traces.length, 12)
  }
  state.exists = true
  await assert.rejects(diagnose(modelDirectory, '/output'), {
    code: 'ERR_ASSERTION',
  })
  state.exists = false
  state.fault = true
  await assert.rejects(diagnose(modelDirectory, '/output'), {
    code: 'ERR_ASSERTION',
  })
  state.fault = false
})

test('diagnostic CLI validates modes and supports repeat', async () => {
  await invokeMainModule(load, ['--help'], '/dispatch/diagnose.mts')
  await missingMainArguments(
    load,
    [[], [modelDirectory], [modelDirectory, 'out', 'invalid']],
    '/dispatch/diagnose.mts',
  )
  await invokeMainModule(
    load,
    [modelDirectory, 'out'],
    '/dispatch/diagnose.mts',
  )
  await invokeMainModule(
    load,
    [modelDirectory, 'out', 'repeat'],
    '/dispatch/diagnose.mts',
  )
})
