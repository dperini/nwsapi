import type { EngineState } from '../state/types.mts'
import { validateCacheOptions } from './configuration.mts'
export function configure(
  engine: EngineState,
  option?: string | Record<string, unknown>,
  clear?: boolean,
) {
  if (typeof option == 'string') {
    return option === 'CACHE_LIMIT' || option === 'CACHE_BYTES'
      ? engine.Config[option]
      : !!engine.Config[option]
  }
  if (!option || typeof option != 'object') {
    return engine.Config
  }
  option = { ...option }
  validateCacheOptions(option)
  if (!engine.legacyHooks && option['LEGACY']) {
    throw new TypeError('Load modules/nwsapi-legacy.js before enabling LEGACY')
  }
  const keys = Object.keys(option)
  for (let index = 0, length = keys.length; index < length; ++index) {
    const key = keys[index]!
    const changed = applyOption(engine, key, option[key])
    clear = clear || changed
  }
  // clear lambda cache
  if (clear) {
    engine.childPlans.clear()
    engine.partCounts.clear()
    engine.siblingDeclined.clear()
    engine.typeRoutes.clear()
    engine.descentDeclined.clear()
    engine.matchLambdas.clear()
    engine.selectLambdas.clear()
    engine.matchResolvers.clear()
    engine.forgivingResolvers.clear()
    engine.selectResolvers.clear()
    engine.firstResolvers.clear()
    engine.hasPlans = undefined
  }
  engine.useLegacy(engine.Config.LEGACY)
  engine.setIdentifierSyntax()
  return true
}

function applyOption(engine: EngineState, key: string, value: unknown) {
  if (key === 'CACHE_LIMIT' || key === 'CACHE_BYTES') {
    const changed = engine.Config[key] !== value
    engine.Config[key] = value as number
    return changed
  }
  const changed = engine.Config[key] !== !!value
  engine.Config[key] = !!value
  if (key === 'LEGACY' && changed) {
    engine.matcherDoc = engine.matcherCache = null
    return true
  }
  // Resolvers capture validation modes and optional planner eligibility.
  return (
    changed &&
    (key === 'FORGIVING' || key === 'VERBOSITY' || key === 'NEURAL_PLANNER')
  )
}
