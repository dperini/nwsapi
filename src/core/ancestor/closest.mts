import type { CompiledResolver, EngineState } from '../state/types.mts'

export function ancestor(
  engine: EngineState,
  selectors: string,
  element: Element | null,
  callback: ((element: Element) => unknown) | undefined,
) {
  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }
  if (!element) {
    engine.parse(selectors, true)
    return null
  }
  var resolvers = closestPlan(engine, selectors, callback),
    planDocument = engine.doc,
    planGeneration = engine.selectorGeneration,
    planLegacy = engine.Config.LEGACY,
    planForgiving = engine.Config.FORGIVING,
    planVerbosity = engine.Config.VERBOSITY,
    previousScope = engine.Snapshot.from,
    scope = element || engine.doc
  engine.Snapshot.from = scope
  try {
    while (element) {
      if (element.ownerDocument !== engine.doc) {
        engine.switchContext(element)
        engine.Snapshot.from = scope
      }
      if (
        engine.doc !== planDocument ||
        engine.selectorGeneration !== planGeneration ||
        engine.Config.LEGACY !== planLegacy ||
        engine.Config.FORGIVING !== planForgiving ||
        engine.Config.VERBOSITY !== planVerbosity
      ) {
        resolvers = closestPlan(engine, selectors, callback)
        planDocument = engine.doc
        planGeneration = engine.selectorGeneration
        planLegacy = engine.Config.LEGACY
        planForgiving = engine.Config.FORGIVING
        planVerbosity = engine.Config.VERBOSITY
      }
      if (engine.match_assert(resolvers, element, callback)) {
        break
      }
      element = engine.upOf(element)
    }
    return element
  } finally {
    engine.Snapshot.from = previousScope
  }
}

function closestPlan(
  engine: EngineState,
  selectors: string,
  callback: ((element: Element) => unknown) | undefined,
): CompiledResolver[] {
  var key = 'closest:' + (callback ? 'true:' : 'false:') + selectors,
    plan = engine.matchResolvers.get(key)
  if (!plan) {
    var parsed = engine.parse(selectors, true)
    plan = parsed ? engine.match_collect(parsed, callback) : []
    engine.matchResolvers.set(key, plan)
  }
  return plan
}
