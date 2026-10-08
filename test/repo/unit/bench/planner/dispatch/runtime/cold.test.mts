import assert from 'node:assert/strict'
import { gzipSync, gunzipSync } from 'node:zlib'
import { test, vi } from 'vitest'
import {
  invokeMainModule,
  missingMainArguments,
} from '../../../main-module.mts'

const state = vi.hoisted(() => ({ writes: vi.fn(), disabled: vi.fn() }))
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((file: string) =>
    file.endsWith('.gz') ? gzipSync(source) : source,
  ),
  writeFileSync: state.writes,
}))
vi.mock('../../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ revision: 'fixture' }),
  sha256: (value: string) => value.length,
}))
vi.mock(
  '../../../../../../../scripts/repo/bench/planner/has/power.mts',
  () => ({ checkedPower: () => 'AC' }),
)
const source =
  'var cache = new Map(); module.exports = function(window) { return { select: function(selector, doc) { var size = doc.getElementsByClassName("hit").length; var key = selector + size; if (!cache.has(key)) cache.set(key, doc.querySelectorAll(selector)); return cache.get(key) }, useNeuralPlanner: function(value) { globalThis.recordDisabled(value) } } }'

async function load() {
  return import('../../../../../../../scripts/repo/bench/planner/dispatch/runtime/cold.mts')
}

test('cold benchmark checks native identity before and after mutation and archives both builds', async () => {
  vi.stubGlobal('recordDisabled', state.disabled)
  try {
    const { coldBenchmark } = await load()
    for (let index = 0, length = 2; index < length; index += 1) {
      state.writes.mockClear()
      coldBenchmark('cold.json', index ? 'baseline.gz' : undefined)
      const report = JSON.parse(state.writes.mock.calls[0]![1] as string)
      assert.equal(report.rows.length, 7)
      assert.equal(report.metadata.rounds, 31)
      assert.equal(report.metadata.selectionIdentityChecked, true)
      assert.equal(report.metadata.mutationChecked, true)
      assert.equal(report.metadata.powerAfter, 'AC')
      assert.equal(
        report.labels[0],
        index ? 'Before cold-path change' : 'Before integration',
      )
      report.rows.forEach(
        (row: { coldMedianMs: number[]; warmMedianMs: number[] }) => {
          assert.equal(row.coldMedianMs.length, 2)
          assert.ok(row.coldMedianMs.every(value => value >= 0))
          assert.equal(row.warmMedianMs.length, 2)
          assert.ok(row.warmMedianMs.every(value => value >= 0))
        },
      )
      assert.equal(
        gunzipSync(state.writes.mock.calls[1]![1]).toString(),
        source,
      )
      assert.equal(
        gunzipSync(state.writes.mock.calls[2]![1]).toString(),
        source,
      )
    }
    assert.ok(state.disabled.mock.calls.every(args => args[0] === null))
  } finally {
    vi.unstubAllGlobals()
  }
})

test('cold benchmark CLI validates required output and supports help', async () => {
  await invokeMainModule(load, ['--help'], '/runtime/cold.mts')
  await missingMainArguments(load, [[]], '/runtime/cold.mts')
  vi.stubGlobal('recordDisabled', state.disabled)
  try {
    await invokeMainModule(
      load,
      ['cold.json', 'baseline.gz'],
      '/runtime/cold.mts',
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
