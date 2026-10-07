import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { fit } from '../../../../../../scripts/repo/bench/planner/has/fit.mts'

test('has fit accepts zero counts, exports guarded routes and rejects incompatible evidence', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-has-fit-'))
  const metadata = { candidateSha256: 'engine', fixtureSha256: 'fixture' }
  const rows = [
    { split: 'train', features: [48, 144, 0, 3], costs: [100, 100, 50] },
  ]
  const write = (host: string, value: unknown) =>
    writeFileSync(
      path.join(directory, `${host}-training.json`),
      JSON.stringify(value),
    )
  const valid = { metadata, rows }
  try {
    write('chromium', valid)
    write('jsdom', valid)
    const result = fit(directory)
    assert.equal(result.observations, 2)
    assert.deepEqual(result.min, [48, 144, 0, 3])
    assert.deepEqual(result.max, [48, 144, 0, 3])
    assert.deepEqual(result.routeLabels, ['forward', 'inverse'])
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
      chooseInverse: (
        anchors: number,
        witnesses: number,
        attributes: number,
      ) => boolean
    }
    assert.equal(generated.chooseInverse(48, 144, 0), true)
    assert.equal(generated.chooseInverse(48, 144, 1), false)
    assert.equal(generated.chooseInverse(48, 48, 0), true)
    const script = path.resolve('scripts/repo/bench/planner/has/fit.mts')
    assert.equal(spawnSync(process.execPath, [script, directory]).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    write('jsdom', {
      ...valid,
      metadata: { ...metadata, candidateSha256: 'other' },
    })
    assert.throws(() => fit(directory))
    write('jsdom', {
      ...valid,
      metadata: { ...metadata, fixtureSha256: 'other' },
    })
    assert.throws(() => fit(directory))
    write('jsdom', { metadata, rows: [] })
    write('chromium', { metadata, rows: [] })
    assert.throws(() => fit(directory))
    write('chromium', {
      metadata,
      rows: [{ ...rows[0], features: [-1, 144, 0, 3] }],
    })
    assert.throws(() => fit(directory))
    write('chromium', { metadata, rows: [{ ...rows[0], costs: [100, 0, 50] }] })
    assert.throws(() => fit(directory))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
