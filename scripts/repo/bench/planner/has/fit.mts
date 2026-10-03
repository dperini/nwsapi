import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha256 } from '../../footprint/shared.mts'
import { isMainModule } from '../../../lib/run-node.mts'
import { expression, train } from '../model.mts'
import type { Features, Observation } from '../model.mts'
import type { Row } from '../measure.mts'
import { guarded, names } from './variants.mts'

export function fit(directory: string) {
  const inputs = ['chromium', 'jsdom'].map(host => {
    const filename = `${host}-training.json`
    const bytes = readFileSync(path.join(directory, filename))
    const data = JSON.parse(bytes.toString()) as {
      rows: Row[]
      metadata: { candidateSha256: string; fixtureSha256: string }
    }
    return { filename, sha256: sha256(bytes), ...data }
  })
  const baseline = inputs[0]!.metadata
  if (
    inputs.some(
      input =>
        input.metadata.candidateSha256 !== baseline.candidateSha256 ||
        input.metadata.fixtureSha256 !== baseline.fixtureSha256,
    )
  ) {
    throw new Error('Training inputs use different builds or fixtures.')
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
    observations.some(
      row =>
        row.features.some(value => !Number.isFinite(value) || value < 0) ||
        row.costs.some(value => !Number.isFinite(value) || value <= 0),
    )
  ) {
    throw new Error('Invalid has training features or timing costs.')
  }
  const model = train(observations)
  const fitted = {
    model,
    min: [0, 1, 2, 3].map(index =>
      Math.min(...observations.map(row => row.features[index]!)),
    ) as Features,
    max: [0, 1, 2, 3].map(index =>
      Math.max(...observations.map(row => row.features[index]!)),
    ) as Features,
    baseline,
  }
  const result = {
    ...fitted,
    observations: observations.length,
    routeLabels: ['forward', 'inverse'],
    featureNames: names,
    inputs: inputs.map(input => ({
      filename: input.filename,
      sha256: input.sha256,
    })),
    expression: expression(model, names),
    guardedExpression: guarded(fitted),
  }
  writeFileSync(
    path.join(directory, 'shared-model.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  writeFileSync(
    path.join(directory, 'shared-model.mjs'),
    `// Experimental has planner. Not imported by the production runtime.\nexport function chooseInverse(anchors, witnesses, attributes) {\n  return ${result.guardedExpression}\n}\n`,
  )
  return result
}

if (isMainModule(import.meta.url)) {
  const directory = process.argv[2]
  if (!directory) {
    throw new Error('Usage: planner/has/fit.mts measurements-directory')
  }
  console.log(fit(directory))
}
