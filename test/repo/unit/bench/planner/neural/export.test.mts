import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { exportDataset } from '../../../../../../scripts/repo/bench/planner/neural/export.mts'
import { missingMainArguments } from '../../main-module.mts'

const trace = {
  entries: 1,
  decisions: 1,
  inverse: 0,
  forward: 1,
  resolver: 1,
  empty: 0,
  facts: {
    eligible: true,
    anchors: 1,
    witnesses: null,
    denseInverse: false,
    weakMapAvailable: true,
  },
  route: 'forward',
  features: [1, 0, 0, 0],
}
const row = {
  id: 'small',
  family: 'small-controls',
  split: 'train',
  fixtureSha256: 'fixture',
  features: [1, 0, 0, 0],
  costs: [100, 90, 95],
  samples: [
    [100, 101, 99],
    [90, 91, 89],
    [95, 96, 94],
  ],
  calls: [[1], [1], [1]],
  routeEvidence: { id: 'small', traces: [trace, trace, trace] },
}
const metadata = {
  format: 2,
  contractVersion: 2,
  candidateSha256: 'engine',
  fixtureSha256: 'fixture',
  power: 'AC',
  host: 'host',
  featureNames: ['anchors', 'witnesses', 'attributes', 'ratio'],
  routeLabels: [
    'baseline',
    'forward-after-preflight',
    'inverse-after-preflight',
  ],
}

test('route export preserves proved baseline costs, host provenance and training family grouping', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-route-export-'))
  const output = path.join(directory, 'dataset')
  const noDecision = {
    entries: 0,
    decisions: 0,
    inverse: 0,
    forward: 0,
    resolver: 0,
    empty: 0,
    facts: null,
    route: 'ineligible',
    features: null,
  }
  const valid = {
    metadata,
    rows: [
      row,
      {
        ...row,
        id: 'ineligible',
        split: 'holdout',
        routeEvidence: {
          id: 'ineligible',
          traces: [noDecision, noDecision, noDecision],
        },
      },
    ],
  }
  const write = (host: string, data: unknown) =>
    writeFileSync(
      path.join(directory, `${host}-training.json`),
      JSON.stringify(data),
    )
  try {
    write('chromium', valid)
    write('jsdom', valid)
    writeFileSync(path.join(directory, 'experiment.json'), '{}')
    const result = exportDataset(directory, output)
    const dataset = JSON.parse(readFileSync(result.output, 'utf8'))
    assert.equal(result.rows, 4)
    assert.equal(dataset.rows[0].baselineCostNs, 100)
    assert.deepEqual(dataset.rows[0].costsNs, [90, 95])
    assert.deepEqual(dataset.rows[0].baselineSamplesNs, [100, 101, 99])
    assert.equal(dataset.rows[0].decisionReached, true)
    assert.equal(dataset.rows[1].decisionReached, false)
    assert.equal(dataset.rows[0].groupId, row.family)
    assert.deepEqual(
      dataset.rows.map((entry: { host: string }) => entry.host),
      ['chromium', 'chromium', 'jsdom', 'jsdom'],
    )
    assert.equal(dataset.source.experimentSha256.length, 64)
    assert.equal(dataset.source.inputs.length, 2)
    const script = path.resolve('scripts/repo/bench/planner/neural/export.mts')
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    assert.equal(
      spawnSync(process.execPath, [script, directory, output]).status,
      0,
    )
    await missingMainArguments(
      () =>
        import('../../../../../../scripts/repo/bench/planner/neural/export.mts'),
      [[], [directory]],
    )
    const invalidMetadata = [
      { ...metadata, format: 1 },
      { ...metadata, contractVersion: 1 },
      { ...metadata, routeLabels: ['forward', 'inverse'] },
      { ...metadata, candidateSha256: 'different' },
      { ...metadata, fixtureSha256: 'different' },
      { ...metadata, featureNames: ['different'] },
    ]
    for (
      let index = 0, length = invalidMetadata.length;
      index < length;
      index += 1
    ) {
      write('jsdom', { ...valid, metadata: invalidMetadata[index] })
      assert.throws(() => exportDataset(directory, output))
    }
    write('jsdom', valid)
    const invalidRows = [
      { ...row, routeEvidence: { ...row.routeEvidence, id: 'wrong' } },
      { ...row, features: [1, 2] },
      { ...row, features: [-1, 0, 0, 0] },
      { ...row, costs: [1, 2] },
      { ...row, costs: [1, 0, 2] },
      { ...row, samples: [[1, 2, 3]] },
      { ...row, samples: [[1], [1, 2, 3], [1, 2, 3]] },
      {
        ...row,
        samples: [
          [0, 1, 2],
          [1, 2, 3],
          [1, 2, 3],
        ],
      },
      { ...row, features: [2, 0, 0, 0] },
    ]
    for (
      let index = 0, length = invalidRows.length;
      index < length;
      index += 1
    ) {
      write('chromium', { metadata, rows: [invalidRows[index]] })
      assert.throws(() => exportDataset(directory, output))
    }
    write('chromium', { metadata, rows: [row, row] })
    assert.throws(() => exportDataset(directory, output))
    write('chromium', valid)
    const mismatches = [
      [],
      [row],
      [
        {
          ...row,
          id: 'other',
          routeEvidence: { ...row.routeEvidence, id: 'other' },
        },
        valid.rows[1],
      ],
      [{ ...row, family: 'other' }, valid.rows[1]],
      [{ ...row, split: 'holdout' }, valid.rows[1]],
      [{ ...row, fixtureSha256: 'other' }, valid.rows[1]],
      [row, { ...valid.rows[1], features: [2, 0, 0, 0] }],
    ]
    for (
      let index = 0, length = mismatches.length;
      index < length;
      index += 1
    ) {
      write('jsdom', { metadata, rows: mismatches[index] })
      assert.throws(() => exportDataset(directory, output))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
