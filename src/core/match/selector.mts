import type { EngineState } from '../state/engine.d.ts'
import type { CompiledResolver } from '../state/types.mts'
export function match_assert(
  _engine: EngineState,
  f: CompiledResolver[],
  element: Element,
  callback: ((element: Element) => unknown) | undefined,
) {
  for (var i = 0, l = f.length, r = false; l > i; ++i) {
    f[i]!(element, callback, null, false) && (r = true)
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
