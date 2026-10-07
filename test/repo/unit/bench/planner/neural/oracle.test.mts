import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
import type { TrainingRow } from '../../../../../../scripts/repo/bench/planner/neural/export.mts'
import {
  comparableCosts,
  geomean,
  summarizeOracle,
  writeOracle,
} from '../../../../../../scripts/repo/bench/planner/neural/oracle.mts'
import { invokeMainModule } from '../../main-module.mts'

function row(overrides: Partial<TrainingRow> = {}): TrainingRow {
  return {
    id: 'case',
    family: 'family',
    split: 'train',
    host: 'chromium',
    features: [64, 256, 0, 4],
    costsNs: [500, 200],
    costSamplesNs: [[500], [200]],
    baselineCostNs: 500,
    baselineSamplesNs: [500],
    groupId: 'family',
    decisionReached: true,
    baselineRoute: 'forward',
    routeFacts: null,
    ...overrides,
  }
}

test('oracle compares routes conservatively and shares choices across observable inputs', () => {
  assert.equal(geomean([]), 1)
  assert.equal(geomean([1, 4]), 2)
  assert.deepEqual(comparableCosts(row()), [500, 500, 200])
  assert.deepEqual(
    comparableCosts(row({ baselineRoute: 'inverse' })),
    [500, 500, 500],
  )
  assert.deepEqual(
    comparableCosts(row({ decisionReached: false })),
    [500, 500, 500],
  )
  const summary = summarizeOracle([
    row(),
    row({ id: 'second', costsNs: [100, 800] }),
    row({ id: 'skipped', decisionReached: false, groupId: 'other' }),
  ])
  assert.equal(summary.featureGroups, 2)
  assert.equal(summary.singletonGroups, 1)
  assert.equal(summary.decisions, 2)
  assert.equal(summary.casesWithOver200nsHeadroom, 1)
  assert.equal(summary.details[2]!.optimisticNs, 500)
  assert.equal(
    summarizeOracle([
      row({
        routeFacts: {
          eligible: true,
          anchors: 64,
          witnesses: 256,
          denseInverse: true,
          weakMapAvailable: true,
        },
      }),
    ]).featureGroups,
    1,
  )
  assert.equal(
    summary.details[0]!.currentInputOracleNs,
    summary.details[1]!.currentInputOracleNs / 4,
  )
})

test('oracle writes corrected host summaries and CLI uses the same diagnostics', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-oracle-'))
  const dataset = path.join(directory, 'dataset.json')
  try {
    writeFileSync(
      dataset,
      JSON.stringify({ format: 2, rows: [row(), row({ host: 'jsdom' })] }),
    )
    const summary = writeOracle(directory)
    assert.equal(summary['chromium']!.cases, 1)
    assert.equal(summary['jsdom']!.cases, 1)
    const report = JSON.parse(
      readFileSync(path.join(directory, 'oracle.json'), 'utf8'),
    )
    assert.equal(report.datasetSha256.length, 64)
    assert.equal(report.results.chromium.details.length, 1)
    const load = () =>
      import('../../../../../../scripts/repo/bench/planner/neural/oracle.mts')
    const subject = '/planner/neural/oracle.mts'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await invokeMainModule(load, ['--help'], subject)
    await assert.rejects(invokeMainModule(load, [], subject))
    await invokeMainModule(load, [directory], subject)
    writeFileSync(dataset, JSON.stringify({ format: 1, rows: [] }))
    assert.throws(() => writeOracle(directory))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
