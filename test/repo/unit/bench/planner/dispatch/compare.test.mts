import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { invokeMainModule, missingMainArguments } from '../../main-module.mts'
const state = vi.hoisted(() => ({ exists: false, fault: '', writes: vi.fn() }))
vi.mock('node:fs', () => ({
  existsSync: () => state.exists,
  writeFileSync: state.writes,
  readFileSync: (file: string) => {
    const rows = ['evaluation', 'development', 'validation'].flatMap(
      (family, index) =>
        [0, 1].map(value => ({
          id: `${family}-${value}`,
          family,
          costs: [4, 2, 1],
          features: [index + value, 0, value],
        })),
    )
    const traces = rows.map(row => ({
      id: row.id,
      traces: [{ route: 'forward' }],
    }))
    const ruleTraces = rows.map((row, index) => ({
      id: row.id,
      traces: [{ route: index % 2 ? 'inverse' : 'forward' }],
    }))
    if (state.fault === 'duplicate') {
      traces.push(traces[0]!)
    }
    if (state.fault === 'missing') {
      traces.shift()
    }
    if (state.fault === 'empty') {
      rows.splice(0, 2)
    }
    return JSON.stringify({
      metadata: {
        variants:
          state.fault === 'variants' && file.includes('repeat')
            ? ['different']
            : ['same'],
      },
      rows:
        state.fault === 'cases' && file.includes('repeat')
          ? rows.slice(1)
          : rows,
      traces,
      ruleTraces,
    })
  },
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts',
  () => ({ split: (family: string) => family }),
)
async function load() {
  return import('../../../../../../scripts/repo/bench/planner/dispatch/compare.mts')
}

test('saved dispatch comparison preserves route differences, groups and feature slices', async () => {
  const { compare } = await load()
  compare('/first', '/repeat', '/out')
  const result = JSON.parse(state.writes.mock.calls.at(-1)![1])
  assert.equal(result.format, 1)
  assert.deepEqual(Object.keys(result.hosts), ['chromium', 'jsdom'])
  assert.equal(result.hosts.chromium.groups.evaluation.first.cases, 2)
  assert.deepEqual(
    result.hosts.chromium.groups.evaluation.first.differentRouteCases,
    ['evaluation-1'],
  )
  assert.equal(
    result.hosts.chromium.groups.evaluation.first.modelTimePercentOfRule,
    50,
  )
  assert.equal(
    result.hosts.chromium.evaluationSlices['filters-0'].first.cases,
    1,
  )
  state.exists = true
  assert.throws(() => compare('/first', '/repeat', '/out'))
  state.exists = false
  for (const fault of ['duplicate', 'missing', 'empty', 'variants', 'cases']) {
    state.fault = fault
    assert.throws(() => compare('/first', '/repeat', '/out'), {
      code: 'ERR_ASSERTION',
    })
  }
  state.fault = ''
})

test('dispatch comparison CLI supports help and rejects every missing argument', async () => {
  await invokeMainModule(load, ['--help'], '/dispatch/compare.mts')
  await missingMainArguments(
    load,
    [[], ['first'], ['first', 'repeat']],
    '/dispatch/compare.mts',
  )
  await invokeMainModule(
    load,
    ['first', 'repeat', 'out'],
    '/dispatch/compare.mts',
  )
})
