import type { EngineState } from '../state/types.mts'
export function configure(
  engine: EngineState,
  option: string | Record<string, unknown>,
  clear?: boolean,
) {
  if (typeof option == 'string') {
    return !!engine.Config[option]
  }
  if (typeof option != 'object') {
    return engine.Config
  }
  for (var i in option) {
    // Resolvers capture forgiving mode and quiet validation failures.
    if (
      (i == 'FORGIVING' || i == 'VERBOSITY') &&
      engine.Config[i] !== !!option[i]
    ) {
      clear = true
    }
    if (!engine.legacyHooks && i == 'LEGACY' && option[i]) {
      throw new TypeError(
        'Load modules/nwsapi-legacy.js before enabling LEGACY',
      )
    }
    if (i == 'LEGACY' && engine.Config[i] !== !!option[i]) {
      engine.matcherDoc = engine.matcherCache = null
      clear = true
    }
    engine.Config[i] = !!option[i]
  }
  // clear lambda cache
  if (clear) {
    engine.childPlans.clear()
    engine.typeRoutes.clear()
    engine.descentDeclined.clear()
    engine.matchLambdas.clear()
    engine.selectLambdas.clear()
    engine.matchResolvers.clear()
    engine.selectResolvers.clear()
    engine.firstResolvers.clear()
    engine.hasPlans = undefined
  }
  engine.useLegacy(engine.Config.LEGACY)
  engine.setIdentifierSyntax()
  return true
}
