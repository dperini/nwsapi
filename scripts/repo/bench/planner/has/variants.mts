import { readFileSync } from 'node:fs'
import { ENGINE_BUILD_PATH } from '../../../lib/paths.mts'
import { expression } from '../model.mts'
import type { Features, Tree } from '../model.mts'
import { routeBundle } from './instrument.mts'

const preparation = 'anchor: anchor,'
const attributeMask =
  '(parts[1].indexOf("[") < 0 ? 0 : 2) + (parts[2].indexOf("[") < 0 ? 0 : 1)'

const marker = 'witnesses.length > anchors.length * 2'
export const names = [
  'anchors',
  'witnesses',
  'attributes',
  '(witnesses / anchors)',
]
export interface Fitted {
  model: Tree
  min: Features
  max: Features
  baseline: { candidateSha256: string }
}

export function baselinePath() {
  return process.env['NWSAPI_PLANNER_BASELINE'] || ENGINE_BUILD_PATH
}

function source() {
  const code = readFileSync(baselinePath(), 'utf8')
  if (code.split(marker).length !== 2 || code.split(preparation).length !== 2) {
    throw new Error('Expected exactly one inverse has planner in the build.')
  }
  return code
}

export function guarded(model: Fitted) {
  const bounds = [0, 1, 3].flatMap(index => [
    `${names[index]} >= ${model.min[index]}`,
    `${names[index]} <= ${model.max[index]}`,
  ])
  bounds.unshift('(attributes === 0 || attributes === 3)')
  return `(${bounds.join(' && ')}) ? ${expression(model.model, names)} : (witnesses <= anchors * 2)`
}

export function probeSource() {
  return routeBundle(annotate(source()), 'baseline', true)
}

export function instrumentedVariants() {
  const original = annotate(source())
  return (['baseline', 'forward', 'inverse'] as const).map(choice =>
    routeBundle(original, choice, true),
  )
}

export function variants(model?: Fitted) {
  const original = source()
  if (!model) {
    return [
      original,
      routeBundle(annotate(original), 'forward'),
      routeBundle(annotate(original), 'inverse'),
    ]
  }
  const call = `(function(anchors, witnesses, attributes){ return ${guarded(model)}; })(anchors.length, witnesses.length, plan.attributeMask)`
  return [
    original,
    routeBundle(annotate(original), 'baseline', false, `!(${call})`),
  ]
}

function annotate(code: string) {
  return code.replace(
    preparation,
    `attributeMask: ${attributeMask}, ${preparation}`,
  )
}

export function preflightVariants() {
  const original = source()
  const gate = `if (${marker}) return null`
  if (original.split(gate).length !== 2) {
    throw new Error('Expected exactly one witness-count gate in the build.')
  }
  return [
    original,
    original.replace(gate, `if (!witnesses.length) return []\n${gate}`),
  ]
}

export function confirmationVariants() {
  return [source(), readFileSync(ENGINE_BUILD_PATH, 'utf8')]
}
