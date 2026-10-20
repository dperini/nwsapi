import { readFileSync } from 'node:fs'
import { ENGINE_BUILD_PATH } from '../../../lib/paths.mts'
import { expression } from '../model.mts'
import type { Features, Tree } from '../model.mts'
import { functionSource, routeBundle } from './instrument.mts'

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

export function source() {
  const code = readFileSync(baselinePath(), 'utf8')
  functionSource(code, 'selectBulkHas')
  functionSource(code, 'shouldDeclineBulkHas')
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
  return routeBundle(source(), 'baseline', true)
}

export function instrumentedVariants() {
  const original = source()
  return (['baseline', 'forward', 'inverse'] as const).map(choice =>
    routeBundle(original, choice, true),
  )
}

export function variants(model?: Fitted) {
  const original = source()
  if (!model) {
    return [
      original,
      routeBundle(original, 'forward'),
      routeBundle(original, 'inverse'),
    ]
  }
  const call = `(function(anchors, witnesses, attributes){ return ${guarded(model)}; })(anchors.length, witnesses.length, plan.plannerMask)`
  return [original, routeBundle(original, 'baseline', false, `!(${call})`)]
}

export function preflightVariants() {
  const original = source()
  return [original, routeBundle(original, 'forward')]
}

export function confirmationVariants() {
  return [source(), readFileSync(ENGINE_BUILD_PATH, 'utf8')]
}
