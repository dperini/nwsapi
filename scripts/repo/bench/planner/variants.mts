import { readFileSync } from 'node:fs'
import { ENGINE_BUILD_PATH } from '../../lib/paths.mts'
import { guardedExpression } from './model.mts'
import type { Domain, Tree } from './model.mts'

const marker =
  "count > 0 && count * 3 > context.getElementsByTagName('*').length"

export function probeSource() {
  const source = variants()[0]!
  return (
    'var plannerProbes = 0;\n' +
    source.replace(marker, `(++plannerProbes, ${marker})`) +
    '\n;module.exports.probes = function() { return plannerProbes; };'
  )
}

export function variants(model?: { model: Tree; domain: Domain }) {
  const source = readFileSync(ENGINE_BUILD_PATH, 'utf8')
  // These are isolated benchmark bundles. Fail closed when the build changes.
  if (source.split(marker).length !== 2) {
    throw new Error('Expected exactly one type-union planner in the build.')
  }
  const replace = (decision: string) =>
    source.replace(
      marker,
      `(function(count, total, arity) { return ${decision}; })(count, context.getElementsByTagName('*').length, collections.length)`,
    )
  if (model) {
    return [source, replace(guardedExpression(model.model, model.domain))]
  }
  return [source, replace('false'), replace('true')]
}
