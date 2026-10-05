import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { sha256 } from '../../footprint/shared.mts'

export interface Weights {
  MEAN: number[]
  SCALE: number[]
  W1: number[][]
  B1: number[]
  W2: number[][]
  B2: number[]
}

function number(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error('Nonfinite weight')
  }
  return '(' + String(value) + ')'
}

function sum(weights: number[], input: string[], bias: number) {
  return weights.reduce(
    (expression, weight, column) =>
      '(' + expression + '+' + number(weight) + '*' + input[column] + ')',
    number(bias),
  )
}

export function scoreSource(weights: Weights, folded: boolean, host?: string) {
  const inputs = [
    'Math.log1p(anchors)',
    'Math.log1p(witnesses)',
    'attributes ? 1 : 0',
    'Math.log1p(witnesses / anchors)',
    host ? String(Number(host === 'chromium')) : "host === 'chromium' ? 1 : 0",
    host ? String(Number(host === 'jsdom')) : "host === 'jsdom' ? 1 : 0",
  ]
  const lines = inputs.map(
    (expression, index) =>
      `var x${index} = ${
        folded
          ? '(' + expression + ')'
          : '((' +
            expression +
            ') - ' +
            number(weights.MEAN[index]!) +
            ') / ' +
            number(weights.SCALE[index]!)
      };`,
  )
  for (const [index, row] of weights.W1.entries()) {
    const w = row.map((value, column) =>
      folded ? value / weights.SCALE[column]! : value,
    )
    let bias = weights.B1[index]!
    if (folded) {
      bias -= row.reduce(
        (total, value, column) =>
          total + (value * weights.MEAN[column]!) / weights.SCALE[column]!,
        0,
      )
    }
    if (folded && host) {
      bias +=
        w[4]! * Number(host === 'chromium') + w[5]! * Number(host === 'jsdom')
      w[4] = 0
      w[5] = 0
    }
    lines.push(
      `var h${index} = Math.tanh(${sum(
        w,
        inputs.map((_, i) => 'x' + i),
        bias,
      )});`,
    )
  }
  const hidden = weights.B1.map((_, index) => 'h' + index)
  if (folded) {
    lines.push(
      `return ${sum(
        weights.W2[0]!.map((value, i) => value - weights.W2[1]![i]!),
        hidden,
        weights.B2[0]! - weights.B2[1]!,
      )};`,
    )
  } else {
    lines.push(`var forward = ${sum(weights.W2[0]!, hidden, weights.B2[0]!)};`)
    lines.push(`var inverse = ${sum(weights.W2[1]!, hidden, weights.B2[1]!)};`)
    lines.push('return forward - inverse;')
  }
  return `export function score(anchors, witnesses, attributes, host) {\n${lines.join('\n')}\n}\n`
}

export function extractWeights(source: string): Weights {
  const values: Record<string, unknown> = {}
  for (const line of source.split('\n')) {
    const match = /^const (MEAN|SCALE|W1|B1|W2|B2) = (.+)$/.exec(line)
    if (match) {
      values[match[1]!] = JSON.parse(match[2]!)
    }
  }
  const weights = values as unknown as Weights
  if (
    weights.MEAN?.length !== 6 ||
    weights.SCALE?.length !== 6 ||
    !validLayers(weights) ||
    weights.SCALE.some(value => value <= 0)
  ) {
    throw new Error('Unexpected neural weight shape')
  }
  return weights
}

function validLayers(weights: Weights) {
  return (
    !!weights.B1?.length &&
    weights.W1?.length === weights.B1.length &&
    weights.W2?.length === 2 &&
    weights.B2?.length === 2 &&
    weights.W1.every(row => row.length === 6) &&
    weights.W2.every(row => row.length === weights.B1.length)
  )
}

export function exportScalar(input: string, output: string) {
  const bytes = readFileSync(path.join(input, 'model.mjs'))
  const weights = extractWeights(bytes.toString())
  const evaluation = JSON.parse(
    readFileSync(path.join(input, 'evaluation.json'), 'utf8'),
  ) as {
    trainingDomain: { anchors: number[]; witnesses: number[]; ratio: number[] }
    minimumPredictedLogCostGap: number
  }
  mkdirSync(output, { recursive: true })
  const config = {
    sourceSha256: sha256(bytes),
    weights,
    domain: evaluation.trainingDomain,
    margin: evaluation.minimumPredictedLogCostGap,
    numericalBand: 1e-6,
    note: 'Old weights used only to isolate export overhead, not validate training labels.',
  }
  const guard = decisionSource(
    config.domain,
    config.margin,
    config.numericalBand,
  )
  writeFileSync(
    path.join(output, 'weights.json'),
    JSON.stringify(config, null, 2) + '\n',
  )
  for (const [name, folded, host] of [
    ['scalar', false, undefined],
    ['folded', true, undefined],
    ['chromium', true, 'chromium'],
    ['jsdom', true, 'jsdom'],
  ] as const) {
    writeFileSync(
      path.join(output, `${name}.mjs`),
      scoreSource(weights, folded, host) + guard,
    )
  }
  writeFileSync(
    path.join(output, 'reference.mjs'),
    bytes.toString() +
      `
export function score(anchors, witnesses, attributes, host) {
  const costs = predictLogCosts([anchors, witnesses, attributes, witnesses / anchors], host);
  return costs[0] - costs[1];
}
` +
      guard,
  )
  return config.sourceSha256
}

function decisionSource(
  domain: { anchors: number[]; witnesses: number[]; ratio: number[] },
  margin: number,
  band: number,
) {
  return `
export function chooseRoute(anchors, witnesses, attributes, dense, host) {
  var fallback = witnesses <= anchors * 2 ||
    (dense && anchors <= 192 && witnesses <= anchors * 4);
  if (!Number.isSafeInteger(anchors) || !Number.isSafeInteger(witnesses) ||
    anchors < ${domain.anchors[0]} || anchors > ${domain.anchors[1]} ||
    witnesses < ${domain.witnesses[0]} || witnesses > ${domain.witnesses[1]} ||
    (attributes !== 0 && attributes !== 3) ||
    (host !== 'chromium' && host !== 'jsdom') ||
    witnesses < anchors * ${domain.ratio[0]} || witnesses > anchors * ${domain.ratio[1]}) {
    return fallback;
  }
  var delta = score(anchors, witnesses, attributes, host);
  if (!Number.isFinite(delta) || Math.abs(delta) <= ${margin + band}) {
    return fallback;
  }
  return delta > 0;
}
`
}

if (isMainModule(import.meta.url)) {
  const [input, output] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: neural/scalar.mts old-model-directory new-output-directory',
    )
  } else if (!input || !output) {
    throw new Error('Model and output directories are required.')
  } else {
    console.log(exportScalar(input, output))
  }
}
