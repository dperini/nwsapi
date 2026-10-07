import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { sha256 } from '../../../../../../scripts/repo/bench/footprint/shared.mts'
import { audit } from '../../../../../../scripts/repo/bench/planner/dispatch/headroom.mts'
import { missingMainArguments } from '../../main-module.mts'

test('headroom audits only supported development controls and rejects mismatched provenance', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-headroom-'))
  const output = path.join(directory, 'report.json')
  const rows = ['chromium', 'jsdom'].flatMap(host => [
    {
      host,
      family: 'controls',
      features: [48, 144, 0, 3],
      costsNs: [100, 50],
      baselineCostNs: 100,
      baselineRoute: 'forward',
      decisionReached: true,
      routeFacts: { denseInverse: false },
    },
    {
      host,
      family: 'controls',
      features: [48, 144, 0, 3],
      costsNs: [50, 100],
      baselineCostNs: 100,
      baselineRoute: 'inverse',
      decisionReached: true,
      routeFacts: { denseInverse: false },
    },
    {
      host,
      family: 'controls',
      features: [48, 144, 0, 3],
      costsNs: [100, 50],
      baselineCostNs: 100,
      baselineRoute: 'forward',
      decisionReached: false,
      routeFacts: null,
    },
    {
      host,
      family: 'controls',
      features: [48, 144, 3, 3],
      costsNs: [100, 50],
      baselineCostNs: 100,
      baselineRoute: 'forward',
      decisionReached: true,
      routeFacts: { denseInverse: false },
    },
    {
      host,
      family: 'dispatch-template-0',
      features: [48, 144, 0, 3],
      costsNs: [100, 50],
      baselineCostNs: 100,
      baselineRoute: 'forward',
      decisionReached: true,
      routeFacts: { denseInverse: false },
    },
  ])
  const bounds = {
    domain: [
      [32, 0, 0, 0, 0],
      [192, 1000, 3, 1, 10],
    ],
    chosen: { categoricalPairs: [[0, 0]] },
  }
  const dataset = Buffer.from(JSON.stringify({ rows }))
  try {
    mkdirSync(path.join(directory, 'dataset'))
    writeFileSync(path.join(directory, 'dataset/dataset.json'), dataset)
    writeFileSync(
      path.join(directory, 'evaluation.json'),
      JSON.stringify({ datasetSha256: sha256(dataset) }),
    )
    writeFileSync(
      path.join(directory, 'chromium-weights.generated.json'),
      JSON.stringify(bounds),
    )
    writeFileSync(
      path.join(directory, 'jsdom-weights.generated.json'),
      JSON.stringify(bounds),
    )
    audit(directory, directory, output)
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.sourceDatasetSha256, sha256(dataset))
    assert.deepEqual(report.results.chromium.anyRoute, {
      cases: 4,
      changedCases: 3,
      geometricTimePercent: 100 / Math.pow(2, 0.75),
      totalTimePercent: 62.5,
    })
    assert.equal(report.results.chromium.forwardOnly.changedCases, 2)
    assert.equal(report.results.chromium.supportedForwardOnly.changedCases, 1)
    assert.deepEqual(report.results.jsdom, report.results.chromium)
    const boundaryRows = ['chromium', 'jsdom'].flatMap(host => [
      { ...rows[0], host, features: [1, 144, 0, 3] },
      { ...rows[0], host, features: [48, 1001, 0, 3] },
      { ...rows[0], host, routeFacts: null },
      { ...rows[0], host, routeFacts: { denseInverse: true } },
      { ...rows[0], host, costsNs: [100, 150] },
    ])
    const boundaryDataset = Buffer.from(JSON.stringify({ rows: boundaryRows }))
    writeFileSync(path.join(directory, 'dataset/dataset.json'), boundaryDataset)
    writeFileSync(
      path.join(directory, 'evaluation.json'),
      JSON.stringify({ datasetSha256: sha256(boundaryDataset) }),
    )
    audit(directory, directory, output)
    const boundaries = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(boundaries.results.chromium.anyRoute.changedCases, 4)
    assert.equal(
      boundaries.results.chromium.supportedForwardOnly.changedCases,
      0,
    )
    const script = path.resolve(
      'scripts/repo/bench/planner/dispatch/headroom.mts',
    )
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    assert.equal(
      spawnSync(process.execPath, [script, directory, directory, output])
        .status,
      0,
    )
    writeFileSync(
      path.join(directory, 'evaluation.json'),
      JSON.stringify({ datasetSha256: 'wrong' }),
    )
    assert.throws(() => audit(directory, directory, output))
    await missingMainArguments(
      () =>
        import('../../../../../../scripts/repo/bench/planner/dispatch/headroom.mts'),
      [[], [directory], [directory, directory]],
      '/planner/dispatch/headroom.mts',
    )
    const missingHost = Buffer.from(
      JSON.stringify({ rows: rows.filter(row => row.host === 'chromium') }),
    )
    writeFileSync(path.join(directory, 'dataset/dataset.json'), missingHost)
    writeFileSync(
      path.join(directory, 'evaluation.json'),
      JSON.stringify({ datasetSha256: sha256(missingHost) }),
    )
    assert.throws(() => audit(directory, directory, output))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
