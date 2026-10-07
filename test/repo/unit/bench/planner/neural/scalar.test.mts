import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import {
  exportScalar,
  extractWeights,
  scoreSource,
} from '../../../../../../scripts/repo/bench/planner/neural/scalar.mts'
import type { Weights } from '../../../../../../scripts/repo/bench/planner/neural/scalar.mts'
import { missingMainArguments } from '../../main-module.mts'

const weights: Weights = {
  MEAN: [1, 2, 0, 1, 0, 0],
  SCALE: [2, 3, 1, 2, 1, 1],
  W1: [
    [0.1, 0.2, 0.3, 0.4, 0.5, -0.5],
    [-0.1, 0.2, -0.3, 0.4, -0.5, 0.5],
  ],
  B1: [0.1, -0.2],
  W2: [
    [1, 2],
    [-1, -2],
  ],
  B2: [0.2, -0.2],
}
function encoded(value: Weights) {
  return Object.entries(value)
    .map(([key, data]) => `const ${key} = ${JSON.stringify(data)}`)
    .join('\n')
}
async function moduleFrom(source: string) {
  return (await import(
    `data:text/javascript,${encodeURIComponent(source)}`
  )) as {
    score: (
      anchors: number,
      witnesses: number,
      attributes: number,
      host: string,
    ) => number
    chooseRoute: (
      anchors: number,
      witnesses: number,
      attributes: number,
      dense: boolean,
      host: string,
    ) => boolean
  }
}

test('scalar and folded exporters preserve normalized network scores in both hosts', async () => {
  assert.deepEqual(extractWeights(encoded(weights)), weights)
  const reference = await moduleFrom(scoreSource(weights, false))
  const variants = [
    await moduleFrom(scoreSource(weights, true)),
    await moduleFrom(scoreSource(weights, true, 'chromium')),
    await moduleFrom(scoreSource(weights, true, 'jsdom')),
    await moduleFrom(scoreSource(weights, false, 'chromium')),
    await moduleFrom(scoreSource(weights, false, 'jsdom')),
  ]
  const hosts = ['chromium', 'jsdom']
  for (let index = 0, length = variants.length; index < length; index += 1) {
    const host = index === 2 || index === 4 ? 'jsdom' : 'chromium'
    const attributes = index % 2 ? 3 : 0
    const actual = variants[index]!.score(48, 144, attributes, host)
    assert.ok(
      Math.abs(actual - reference.score(48, 144, attributes, host)) < 1e-12,
    )
  }
  assert.notEqual(
    reference.score(48, 144, 0, hosts[0]!),
    reference.score(48, 144, 0, hosts[1]!),
  )
  assert.throws(() => scoreSource({ ...weights, B1: [Infinity, 0] }, false))
  const invalid = [
    { ...weights, MEAN: [] },
    { ...weights, SCALE: [] },
    { ...weights, B1: [] },
    { ...weights, W1: [] },
    { ...weights, W2: [] },
    { ...weights, B2: [] },
    { ...weights, W1: [[1], [1]] },
    { ...weights, W2: [[1], [1]] },
    { ...weights, SCALE: [0, 1, 1, 1, 1, 1] },
  ]
  assert.throws(() => extractWeights(''))
  for (let index = 0, length = invalid.length; index < length; index += 1) {
    assert.throws(() => extractWeights(encoded(invalid[index]!)))
  }
})

test('scalar exports persist provenance and guarded choices alongside reference code', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-scalar-'))
  const output = path.join(directory, 'export')
  const domain = { anchors: [32, 192], witnesses: [0, 768], ratio: [0, 4] }
  try {
    const original =
      encoded(weights) +
      '\nexport function predictLogCosts() { return [0, 0] }\n'
    writeFileSync(path.join(directory, 'model.mjs'), original)
    writeFileSync(
      path.join(directory, 'evaluation.json'),
      JSON.stringify({
        trainingDomain: domain,
        minimumPredictedLogCostGap: 0.01,
      }),
    )
    const digest = exportScalar(directory, output)
    const config = JSON.parse(
      readFileSync(path.join(output, 'weights.json'), 'utf8'),
    )
    assert.equal(config.sourceSha256, digest)
    assert.deepEqual(config.weights, weights)
    assert.deepEqual(config.domain, domain)
    const reference = await moduleFrom(
      readFileSync(path.join(output, 'reference.mjs'), 'utf8'),
    )
    assert.equal(reference.chooseRoute(48, 144, 0, false, 'chromium'), false)
    assert.equal(reference.chooseRoute(48, 144, 0, true, 'chromium'), true)
    const names = ['scalar', 'folded', 'chromium', 'jsdom']
    for (let index = 0, length = names.length; index < length; index += 1) {
      const model = await moduleFrom(
        readFileSync(path.join(output, `${names[index]}.mjs`), 'utf8'),
      )
      assert.equal(
        typeof model.chooseRoute(48, 144, 0, false, 'chromium'),
        'boolean',
      )
      assert.equal(model.chooseRoute(1, 10, 0, false, 'chromium'), false)
      assert.equal(model.chooseRoute(48, 48, 1, false, 'unknown'), true)
    }
    const script = path.resolve('scripts/repo/bench/planner/neural/scalar.mts')
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    assert.equal(
      spawnSync(process.execPath, [script, directory, output]).status,
      0,
    )
    await missingMainArguments(
      () =>
        import('../../../../../../scripts/repo/bench/planner/neural/scalar.mts'),
      [[], [directory]],
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
