import { pureCompiler, pureSelector } from '../compile/pure.mts'
import type { EngineState } from '../state/types.mts'

export function groupSelectors(engine: EngineState, selectors: string[]) {
  if (
    selectors.length < 2 ||
    !pureCompiler(engine) ||
    !selectors.every(pureSelector)
  ) {
    return selectors
  }
  const groups: Record<string, string[]> = engine.primordials.ObjectCreate(null)
  const seeds: string[] = []
  for (let index = 0, length = selectors.length; index < length; ++index) {
    const selector = selectors[index]!
    const token = selector.match(engine.reOptimizer)
    const seed = token && token[1] !== ':' ? (token[1] || '') + token[2] : '*'
    if (!groups[seed]) {
      groups[seed] = []
      seeds.push(seed)
    }
    groups[seed]!.push(selector)
  }
  const result: string[] = []
  for (let index = 0, length = seeds.length; index < length; ++index) {
    const seed = seeds[index]!
    const branches = groups[seed]!
    const argument = branches.join(',')
    if (branches.length > 1 && branches.length <= 8 && argument.length <= 512) {
      result.push(seed + ':is(' + argument + ')')
    } else {
      result.push(...branches)
    }
  }
  return result
}
