import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha256 } from '../footprint/shared.mts'
import type { Row } from './measure.mts'
import { expression, guardedExpression, train } from './model.mts'
import type { Domain, Features, Observation } from './model.mts'
import { isMainModule } from '../../lib/run-node.mts'

export function fit(directory: string) {
  const inputs = ['chromium', 'jsdom'].map(host => {
    const filename = `${host}-training.json`
    const bytes = readFileSync(path.join(directory, filename))
    const data = JSON.parse(bytes.toString()) as {
      rows: Row[]
      metadata: { candidateSha256: string; fixtureGeneratorSha256: string }
    }
    return { filename, sha256: sha256(bytes), ...data }
  })
  const baseline = inputs[0]!.metadata
  if (
    inputs.some(
      input =>
        input.metadata.candidateSha256 !== baseline.candidateSha256 ||
        input.metadata.fixtureGeneratorSha256 !==
          baseline.fixtureGeneratorSha256,
    )
  ) {
    throw new Error(
      'Training inputs use different engines or fixture generators.',
    )
  }
  const observations: Observation[] = inputs.flatMap(input =>
    input.rows
      .filter(row => row.split === 'train')
      .map(row => ({
        features: row.features,
        costs: [row.costs[1]!, row.costs[2]!] as [number, number],
      })),
  )
  if (
    !observations.length ||
    observations.some(row =>
      [...row.features, ...row.costs].some(
        value => !Number.isFinite(value) || value <= 0,
      ),
    )
  ) {
    throw new Error(
      'Training requires positive finite features and route costs.',
    )
  }
  const model = train(observations)
  const domain: Domain = {
    min: [0, 1, 2, 3].map(index =>
      Math.min(...observations.map(row => row.features[index]!)),
    ) as Features,
    max: [0, 1, 2, 3].map(index =>
      Math.max(...observations.map(row => row.features[index]!)),
    ) as Features,
    arities: [...new Set(observations.map(row => row.features[2]))],
  }
  const result = {
    inputs: inputs.map(({ filename, sha256: hash }) => ({
      filename,
      sha256: hash,
    })),
    observations: observations.length,
    baseline,
    model,
    domain,
    expression: expression(model),
    guardedExpression: guardedExpression(model, domain),
  }
  writeFileSync(
    path.join(directory, 'shared-model.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  writeFileSync(
    path.join(directory, 'shared-model.mjs'),
    `// Experimental model. The production runtime does not import this file.\nexport function chooseBroad(count, total, arity) {\n  return ${result.guardedExpression}\n}\n`,
  )
  return result
}

if (isMainModule(import.meta.url)) {
  const directory = process.argv[2]
  if (!directory) {
    throw new Error('Usage: planner/fit.mts measurements-directory')
  }
  console.log(fit(directory))
}
