import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'

export interface ScalarModel {
  score(a: number, w: number, attributes: number, host: string): number
  chooseRoute(
    a: number,
    w: number,
    attributes: number,
    dense: boolean,
    host: string,
  ): boolean
}
export type Input = [number, number, number, boolean, string]

export function parityInputs(): Input[] {
  let seed = 20_261_005
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    return seed / 4_294_967_296
  }
  const inputs: Input[] = []
  for (let i = 0; i < 10_000; ++i) {
    inputs.push([
      1 + Math.floor(random() * 1000),
      Math.floor(random() * 3000),
      Math.floor(random() * 4),
      random() > 0.5,
      i % 2 ? 'chromium' : 'jsdom',
    ])
  }
  for (const a of [0, 1, 31, 32, 192, 193, 745, 746]) {
    for (const w of [0, 1, 2 * a, 2 * a + 1, 4 * a, 4 * a + 1]) {
      for (const dense of [false, true]) {
        inputs.push([a, w, 0, dense, 'chromium'])
      }
    }
  }
  return inputs
}

export async function checkParity(directory: string) {
  const inputs = parityInputs()
  const names = ['reference', 'scalar', 'folded', 'chromium', 'jsdom']
  const models = await Promise.all(
    names.map(
      name =>
        import(path.resolve(directory, `${name}.mjs`)) as Promise<ScalarModel>,
    ),
  )
  const errors = names.map(() => 0)
  for (const [a, w, attrs, dense, host] of inputs) {
    const expected = models[0]!.chooseRoute(a, w, attrs, dense, host)
    const score = models[0]!.score(a, w, attrs, host)
    for (let i = 1; i < models.length; ++i) {
      if (i >= 3 && names[i] !== host) {
        continue
      }
      assert.equal(models[i]!.chooseRoute(a, w, attrs, dense, host), expected)
      if (a && Number.isFinite(score)) {
        const error = Math.abs(score - models[i]!.score(a, w, attrs, host))
        errors[i] = Math.max(errors[i]!, error)
        assert.ok(error < 1e-12, `Scalar export error: ${error}`)
      }
    }
  }
  const result = {
    cases: inputs.length,
    decisionDisagreements: 0,
    maximumScoreErrors: Object.fromEntries(
      names.map((name, i) => [name, errors[i]]),
    ),
  }
  writeFileSync(
    path.join(directory, 'parity.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  writeFileSync(
    path.join(directory, 'parity-inputs.json'),
    JSON.stringify(inputs) + '\n',
  )
  const weights = JSON.parse(
    readFileSync(path.join(directory, 'weights.json'), 'utf8'),
  )
  writeFileSync(
    path.join(directory, 'parity-reference.json'),
    JSON.stringify({
      ...weights,
      cases: inputs
        .filter(input => input[0] > 0)
        .map(([a, w, attrs, dense, host]) => ({
          input: [a, w, attrs, dense, host],
          score: models[0]!.score(a, w, attrs, host),
          decision: models[0]!.chooseRoute(a, w, attrs, dense, host),
        })),
    }) + '\n',
  )
  return result
}

if (isMainModule(import.meta.url)) {
  const [directory] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: neural/parity.mts scalar-export-directory')
  } else if (!directory) {
    throw new Error('Scalar export directory is required.')
  } else {
    console.log(await checkParity(directory))
  }
}
