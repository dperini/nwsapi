import { readFileSync } from 'node:fs'
import { baselinePath } from '../has/variants.mts'
import { replaceFunction } from '../has/instrument.mts'
import { adaptiveHas, forwardTo, inverseSuffix } from './runtime.mts'

export type AdaptiveMode =
  | 'forward'
  | 'inverse'
  | 'prefix-continue'
  | 'prefix-switch'
  | 'prefix-rule'
export const adaptiveNames = [
  'baseline',
  'forward',
  'inverse',
  'prefix-continue',
  'prefix-switch',
  'prefix-rule',
] as const

export function adaptiveBundle(
  mode: AdaptiveMode,
  prefix = 4,
  instrument = false,
  model?: string,
) {
  const original = readFileSync(baselinePath(), 'utf8')
  const count = mode === 'forward' || mode === 'inverse' ? 0 : prefix
  const choose =
    mode === 'inverse' || mode === 'prefix-switch'
      ? 'true'
      : mode === 'prefix-rule'
        ? 'passed > 0 && hits * 2 < passed'
        : 'false'
  const decision =
    model ||
    `function adaptiveChoice(anchors, processed, passed, hits, candidates, dense) {
    ${instrument ? 'adaptiveObservations.push([anchors, processed, passed, hits, candidates, Number(dense)]);' : ''}
    return ${choose};
  }`
  const replacement = `${forwardTo.toString()}\n${inverseSuffix.toString()}\n${adaptiveHas.toString()}
    ${decision}
    function selectBulkHas(engine, plan, context, anchors) {
      return adaptiveHas(engine, plan, context, anchors, ${count}, adaptiveChoice);
    }`
  const source = replaceFunction(original, 'selectBulkHas', replacement)
  return instrument
    ? `var adaptiveObservations = [];\n${source}
    ;module.exports.observations = function() { return adaptiveObservations; };
    module.exports.resetObservations = function() { adaptiveObservations.length = 0; };
  `
    : source
}

export function adaptiveVariants(prefix = 4) {
  return [
    readFileSync(baselinePath(), 'utf8'),
    ...adaptiveNames
      .slice(1)
      .map(mode => adaptiveBundle(mode as AdaptiveMode, prefix)),
  ]
}
