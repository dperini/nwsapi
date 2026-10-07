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
import { test, vi } from 'vitest'
import {
  checkParity,
  parityInputs,
} from '../../../../../../scripts/repo/bench/planner/neural/parity.mts'
import { invokeMainModule } from '../../main-module.mts'

function models(
  directory: string,
  failure: 'none' | 'decision' | 'score' = 'none',
) {
  mkdirSync(directory)
  const names = ['reference', 'scalar', 'folded', 'chromium', 'jsdom']
  for (let index = 0, length = names.length; index < length; index += 1) {
    const changeScore = index === 1 && failure === 'score'
    const changeDecision = index === 1 && failure === 'decision'
    writeFileSync(
      path.join(directory, `${names[index]}.mjs`),
      `export function score(anchors, witnesses) { return witnesses ? witnesses / anchors ${changeScore ? '+ 1' : ''} : NaN }\nexport function chooseRoute(anchors, witnesses) { return ${changeDecision ? 'false' : 'witnesses <= anchors * 2'} }\n`,
    )
  }
  writeFileSync(
    path.join(directory, 'weights.json'),
    JSON.stringify({ sourceSha256: 'source' }),
  )
}

test('scalar parity proves deterministic randomized and boundary cases in both hosts', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-parity-'))
  const valid = path.join(directory, 'valid')
  try {
    models(valid)
    const inputs = parityInputs()
    assert.equal(inputs.length, 10_096)
    assert.deepEqual(inputs, parityInputs())
    assert.ok(inputs.some(input => input[0] === 0))
    assert.deepEqual(
      new Set(inputs.map(input => input[4])),
      new Set(['chromium', 'jsdom']),
    )
    const result = await checkParity(valid)
    assert.equal(result.cases, inputs.length)
    assert.equal(result.decisionDisagreements, 0)
    assert.deepEqual(Object.values(result.maximumScoreErrors), [0, 0, 0, 0, 0])
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(valid, 'parity-inputs.json'), 'utf8')),
      inputs,
    )
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(valid, 'parity.json'), 'utf8')),
      result,
    )
    const reference = JSON.parse(
      readFileSync(path.join(valid, 'parity-reference.json'), 'utf8'),
    )
    assert.equal(reference.sourceSha256, 'source')
    assert.ok(
      reference.cases.every(
        (entry: { input: number[] }) => entry.input[0]! > 0,
      ),
    )
    const script = path.resolve('scripts/repo/bench/planner/neural/parity.mts')
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    assert.equal(spawnSync(process.execPath, [script, valid]).status, 0)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await invokeMainModule(
        () =>
          import('../../../../../../scripts/repo/bench/planner/neural/parity.mts'),
        ['--help'],
        '/planner/neural/parity.mts',
      )
      await assert.rejects(
        invokeMainModule(
          () =>
            import('../../../../../../scripts/repo/bench/planner/neural/parity.mts'),
          [],
          '/planner/neural/parity.mts',
        ),
      )
      await invokeMainModule(
        () =>
          import('../../../../../../scripts/repo/bench/planner/neural/parity.mts'),
        [valid],
        '/planner/neural/parity.mts',
      )
    } finally {
      log.mockRestore()
    }
    const wrongDecision = path.join(directory, 'wrong-decision')
    models(wrongDecision, 'decision')
    await assert.rejects(checkParity(wrongDecision), { code: 'ERR_ASSERTION' })
    const wrongScore = path.join(directory, 'wrong-score')
    models(wrongScore, 'score')
    await assert.rejects(checkParity(wrongScore), { code: 'ERR_ASSERTION' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
