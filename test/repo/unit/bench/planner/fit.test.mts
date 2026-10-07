import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { fit } from '../../../../../scripts/repo/bench/planner/fit.mts'

test('fit records input provenance and produces a bounded executable model', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-fit-'))
  const metadata = {
    candidateSha256: 'engine',
    fixtureGeneratorSha256: 'fixture',
  }
  const data = {
    metadata,
    rows: [
      { split: 'train', features: [10, 100, 2, 0.1], costs: [5, 4, 2] },
      { split: 'holdout', features: [20, 100, 2, 0.2], costs: [5, 4, 2] },
    ],
  }
  const write = (host: string, value: unknown) =>
    writeFileSync(
      path.join(directory, `${host}-training.json`),
      JSON.stringify(value),
    )
  try {
    write('chromium', data)
    write('jsdom', data)
    const result = fit(directory)
    assert.equal(result.observations, 2)
    assert.deepEqual(result.domain, {
      min: [10, 100, 2, 0.1],
      max: [10, 100, 2, 0.1],
      arities: [2],
    })
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(directory, 'shared-model.json'), 'utf8'),
      ),
      result,
    )
    const moduleSource = readFileSync(
      path.join(directory, 'shared-model.mjs'),
      'utf8',
    )
    const generated = (await import(
      `data:text/javascript,${encodeURIComponent(moduleSource)}`
    )) as {
      chooseBroad: (count: number, total: number, arity: number) => boolean
    }
    assert.equal(generated.chooseBroad(10, 100, 2), true)
    assert.equal(generated.chooseBroad(1, 100, 2), false)
    const script = path.resolve('scripts/repo/bench/planner/fit.mts')
    const validRun = spawnSync(process.execPath, [script, directory], {
      encoding: 'utf8',
    })
    assert.equal(validRun.status, 0)
    const missingDirectory = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
    })
    assert.equal(missingDirectory.status, 1)
    write('jsdom', {
      ...data,
      metadata: { ...metadata, candidateSha256: 'different' },
    })
    assert.throws(() => fit(directory))
    write('jsdom', {
      ...data,
      metadata: { ...metadata, fixtureGeneratorSha256: 'different' },
    })
    assert.throws(() => fit(directory))
    write('jsdom', data)
    write('chromium', { metadata, rows: [] })
    write('jsdom', { metadata, rows: [] })
    assert.throws(() => fit(directory))
    write('chromium', {
      metadata,
      rows: [{ split: 'train', features: [0, 100, 2, 0.1], costs: [5, 4, 2] }],
    })
    assert.throws(() => fit(directory))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
