import { readFileSync } from 'node:fs'
import { ENGINE_BUILD_PATH } from '../../../lib/paths.mts'
import { expression } from '../model.mts'
import type { Features, Tree } from '../model.mts'

const preparation = 'anchor: plan(engine, parts[1], context),'
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
  const probe =
    '(++plannerProbes, plannerFeatures = [anchors.length, witnesses.length, plan.attributeMask, witnesses.length / anchors.length], ' +
    marker +
    ')'
  return (
    'var plannerProbes = 0, plannerFeatures;\n' +
    annotate(source()).replace(marker, probe) +
    '\n;module.exports.probes = function(){return plannerProbes;}; module.exports.features = function(){return plannerFeatures;};'
  )
}

export function variants(model?: Fitted) {
  const original = source()
  if (!model) {
    return [
      original,
      annotate(original).replace(marker, 'true'),
      annotate(original).replace(marker, 'false'),
    ]
  }
  const call = `(function(anchors, witnesses, attributes){ return ${guarded(model)}; })(anchors.length, witnesses.length, plan.attributeMask)`
  return [original, annotate(original).replace(marker, `!(${call})`)]
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
