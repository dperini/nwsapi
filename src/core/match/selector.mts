import type { EngineState, CompiledResolver } from '../state/types.mts'

export function match_assert(
  _engine: EngineState,
  f: CompiledResolver[],
  element: Element,
  callback: ((element: Element) => unknown) | undefined,
) {
  for (var i = 0, l = f.length, r = false; l > i; ++i) {
    if (f[i]!(element, callback, null, false)) {
      // One match decides the result. A callback still has to observe
      // every matching alternative, so only callback-free matching
      // can stop at the first one.
      if (!callback) {
        return true
      }
      r = true
    }
  }
  return r
}

export function match_collect(
  engine: EngineState,
  selectors: string[],
  callback: ((element: Element) => unknown) | undefined,
) {
  for (
    var i = 0, l = selectors.length || 0, f = Array<CompiledResolver>(l);
    l > i;
    ++i
  ) {
    f[i] = engine.compile(selectors[i]!, false, callback)!
  }
  return f
}

export function match(
  engine: EngineState,
  selectors: string,
  element: Element,
  callback?: (element: Element) => unknown,
) {
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return false
  }
  var resolver,
    cacheKey = !!callback + ':' + selectors

  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }

  if (element && (resolver = engine.matchResolvers.get(cacheKey))) {
    return engine.match_assert(resolver, element, callback)
  }

  resolver = engine.match_collect(
    engine.parse(selectors, false) as string[],
    callback,
  )
  engine.matchResolvers.set(cacheKey, resolver)

  return engine.match_assert(resolver, element, callback)
}

export function matchPublic(
  engine: EngineState,
  selectors: string,
  element: Element,
  callback?: (element: Element) => unknown,
) {
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return false
  }
  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }
  var previousScope = engine.Snapshot.from
  engine.Snapshot.from = element || engine.doc
  try {
    return engine.match(selectors, element, callback)
  } finally {
    engine.Snapshot.from = previousScope
  }
}

export function matchForgiving(
  engine: EngineState,
  list: string[],
  element: Element,
) {
  for (var i = 0, l = list.length; l > i; ++i) {
    try {
      if (engine.match(list[i]!, element)) {
        return true
      }
    } catch (e) {}
  }
  return false
}

export function prepareForgiving(engine: EngineState, selectors: string[]) {
  var selectVars = engine.S_VARS
  var matchVars = engine.M_VARS
  var nodeVars = engine.N_VARS
  var previousErrors = engine.errors
  var key = JSON.stringify([
      engine.selectorGeneration,
      engine.Config.FORGIVING,
      engine.Config.VERBOSITY,
      engine.Config.LEGACY,
      engine.HTML_DOCUMENT,
      engine.QUIRKS_MODE,
      engine.NAMESPACE,
      selectors,
    ]),
    resolvers = engine.forgivingResolvers.get(key)
  if (resolvers) {
    return resolvers
  }
  engine.S_VARS = []
  engine.M_VARS = []
  engine.N_VARS = []
  resolvers = Array<CompiledResolver[] | null>(selectors.length)
  try {
    for (var length = selectors.length, i = 0; i < length; ++i) {
      engine.errors = previousErrors
      if (!selectors[i]) {
        resolvers[i] = null
        continue
      }
      try {
        var parsed = engine.parse(selectors[i]!, false)
        if (!parsed) {
          resolvers[i] = null
          continue
        }
        var branches = engine.match_collect(parsed, undefined)
        resolvers[i] = branches
      } catch {
        resolvers[i] = null
      }
      if (engine.errors !== previousErrors) {
        resolvers[i] = null
        engine.errors = previousErrors
      }
    }
  } finally {
    engine.S_VARS = selectVars
    engine.M_VARS = matchVars
    engine.N_VARS = nodeVars
    engine.errors = previousErrors
  }
  return engine.forgivingResolvers.set(key, resolvers)
}

export function matchPreparedForgiving(
  engine: EngineState,
  resolvers: Array<CompiledResolver[] | null>,
  element: Element,
) {
  for (var length = resolvers.length, i = 0; i < length; ++i) {
    var resolver = resolvers[i]
    if (resolver) {
      try {
        if (engine.match_assert(resolver, element, undefined)) {
          return true
        }
      } catch {}
    }
  }
  return false
}

export function forgivingKey(engine: EngineState, selectors: string[]) {
  var key = JSON.stringify([
      engine.selectorGeneration,
      engine.Config.FORGIVING,
      engine.Config.VERBOSITY,
      engine.Config.LEGACY,
      engine.HTML_DOCUMENT,
      engine.QUIRKS_MODE,
      engine.NAMESPACE,
      selectors,
    ]),
    resolvers = engine.forgivingResolvers.get(key)
  if (!resolvers) {
    resolvers = engine.prepareForgiving(selectors)
    engine.forgivingResolvers.set(key, resolvers)
  }
  return key
}

export function matchForgivingKey(
  engine: EngineState,
  key: string,
  element: Element,
) {
  var resolvers = engine.forgivingResolvers.get(key)
  if (!resolvers) {
    var profile = JSON.parse(key) as [
      number,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      string | null,
      string[],
    ]
    resolvers = engine.prepareForgiving(profile[7])
    engine.forgivingResolvers.set(key, resolvers)
  }
  return engine.matchPreparedForgiving(resolvers, element)
}
