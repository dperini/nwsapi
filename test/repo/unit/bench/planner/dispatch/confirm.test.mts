import assert from 'node:assert/strict'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { test, vi } from 'vitest'
import { invokeMainModule, missingMainArguments } from '../../main-module.mts'
const state = vi.hoisted(() => ({
  exists: false,
  rules: true,
  policies: true,
  proved: true,
  status: 'validation-passed',
  fault: '',
  slow: false,
  writes: vi.fn(),
  settings: { rounds: 0, milliseconds: 0 },
}))
const entries = ['train', 'development', 'validation', 'evaluation'].flatMap(
  family =>
    Array.from({ length: 9 }, (_, index) => ({
      id: `${family}-${index}`,
      family,
    })),
)
function evaluation() {
  return {
    datasetSha256: state.fault === 'dataset' ? 'bad' : 'hash',
    results: Object.fromEntries(
      ['chromium', 'jsdom'].map(host => [
        host,
        {
          status: state.status,
          modelSha256: 'hash',
          ruleSha256: 'hash',
          chosen: { forwardOnlyProof: { proved: state.proved } },
          simpleRule: {
            forwardOnly: state.proved,
            ...(state.policies ? { policies: [[1]] } : {}),
          },
        },
      ]),
    ),
  }
}
vi.mock('node:fs', () => ({
  existsSync: (file: string) =>
    file.endsWith('-rule-parity.json') ? state.rules : state.exists,
  mkdirSync: vi.fn(),
  writeFileSync: state.writes,
  readFileSync: (file: string) => {
    if (file.endsWith('evaluation.json')) {
      return JSON.stringify(evaluation())
    }
    if (file.endsWith('fixtures.json.gz')) {
      return gzipSync(JSON.stringify(entries))
    }
    if (file.endsWith('.gz')) {
      return gzipSync('build')
    }
    if (file.endsWith('-parity.json')) {
      return JSON.stringify([
        {
          features: [32, 100, 1, 0, 3.125],
          override: state.fault !== 'parity',
        },
      ])
    }
    return 'build'
  },
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
  '../../../../../../scripts/repo/bench/planner/dispatch/variants.mts',
  () => ({ dispatchBundle: () => 'dispatch' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/specialize.mts',
  () => ({ splitDispatchBundle: () => 'split' }),
)
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts',
  () => ({ split: (family: string) => family }),
)
vi.mock('../../../../../../scripts/repo/bench/planner/measure.mts', () => {
  const measure = async (
    selected: Array<{ id: string; family: string }>,
    sources: string[],
  ) =>
    selected.map(entry => ({
      ...entry,
      costs: sources.map((_, index) => (index ? (state.slow ? 5 : 1) : 4)),
    }))
  return {
    settings: state.settings,
    measureBrowser: async (...args: Parameters<typeof measure>) => ({
      version: 'fixture',
      rows: await measure(...args),
    }),
    measureJsdom: measure,
  }
})
vi.mock('../../../../../../scripts/repo/bench/planner/has/evidence.mts', () => {
  function routeFor(index: number) {
    if (state.fault === 'route') {
      return 'bad'
    }
    if (index === 0) {
      return 'ineligible'
    }
    if (index === 1 || index === 4 || index === 5) {
      return 'forward'
    }
    return index === 3 ? 'forward' : 'inverse'
  }
  const evidence = (
    selected: Array<{ id: string }>,
    _sources: string[],
    verify: (row: unknown) => void,
    iterations: number,
  ) =>
    selected.map((entry, index) => {
      const facts =
        index === 0
          ? undefined
          : {
              eligible: true,
              anchors: 32,
              witnesses: index === 3 ? 1 : 100,
              denseInverse: false,
              weakMapAvailable: index !== 4,
            }
      const features =
        index === 1
          ? undefined
          : [32, facts?.witnesses || 100, index === 5 ? 0 : 1, 3.125]
      const trace = {
        facts,
        features,
        route: routeFor(index),
        cacheHits: state.fault === 'cache' ? 0 : 1,
        inferences: index === 6 ? undefined : 0,
      }
      const row = { id: entry.id, traces: [trace] }
      assert.ok(iterations === 1 || iterations === 3)
      verify(row)
      return row
    })
  return {
    browserEvidence: async (...args: Parameters<typeof evidence>) =>
      evidence(...args),
    jsdomEvidence: evidence,
  }
})
for (const host of ['chromium', 'jsdom', 'chromium-rule', 'jsdom-rule']) {
  vi.doMock(path.resolve('/model', `${host}.mjs`), () => ({
    dispatchOverride: (...values: number[]) =>
      values.every(Number.isFinite) && values[2] === 1,
  }))
}
async function load() {
  return import('../../../../../../scripts/repo/bench/planner/dispatch/confirm.mts')
}

test('confirmation checks parity, selects qualified holdouts and measures cache and split variants independently', async () => {
  const { confirm, parity } = await load()
  for (let index = 0, length = 4; index < length; index += 1) {
    state.writes.mockClear()
    state.policies = index !== 0
    state.status = index === 3 ? 'validation-failed' : 'validation-passed'
    state.slow = index === 3
    await confirm(
      '/collection',
      '/model',
      '/output',
      !!index,
      index === 1,
      index === 2,
    )
    const output = state.writes.mock.calls.find(args =>
      String(args[0]).endsWith('chromium.json'),
    )!
    const report = JSON.parse(output[1])
    assert.equal(report.rows.length, index === 3 ? 18 : 27)
    assert.equal(report.metadata.labels.length, index === 1 ? 5 : 3)
    assert.equal(report.metadata.settings.milliseconds, index ? 24 : 20)
    assert.equal(report.traces.length, report.rows.length)
    assert.equal(
      report.cachedTraces.length,
      index === 1 ? report.rows.length : 0,
    )
    assert.equal(report.summaries.validation.model.passesGate, index !== 3)
    assert.equal(
      report.rows[0].id,
      index ? (index === 3 ? 'validation-8' : 'evaluation-8') : 'development-0',
    )
    assert.equal(Object.hasOwn(report.summaries, 'evaluation'), index !== 3)
  }
  state.slow = false
  state.status = 'validation-passed'
  state.rules = false
  assert.deepEqual((await parity('/model', evaluation())).ruleCases, {})
  state.rules = true
  await assert.rejects(
    confirm('/collection', '/model', '/output', false, true, true),
    { code: 'ERR_ASSERTION' },
  )
  state.exists = true
  await assert.rejects(confirm('/collection', '/model', '/output'))
  state.exists = false
  for (const fault of ['dataset', 'parity', 'route', 'cache']) {
    state.fault = fault
    await assert.rejects(
      confirm('/collection', '/model', '/output', false, fault === 'cache'),
      { code: 'ERR_ASSERTION' },
    )
  }
  state.fault = ''
  state.proved = false
  await assert.rejects(
    confirm('/collection', '/model', '/output', false, false, true),
    { code: 'ERR_ASSERTION' },
  )
  state.proved = true
})

test('confirmation CLI validates every required operand and supports all timing modes', async () => {
  await invokeMainModule(load, ['--help'], '/dispatch/confirm.mts')
  await missingMainArguments(
    load,
    [
      [],
      ['collection'],
      ['collection', '/model'],
      ['collection', '/model', 'out', 'invalid'],
    ],
    '/dispatch/confirm.mts',
  )
  for (const args of [
    [],
    ['repeat'],
    ['cached'],
    ['repeat-cached'],
    ['split'],
    ['repeat-split'],
  ]) {
    await invokeMainModule(
      load,
      ['collection', '/model', 'out', ...args],
      '/dispatch/confirm.mts',
    )
  }
})
