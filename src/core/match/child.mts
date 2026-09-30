import type { EngineState } from '../state/types.mts'
export function hasChild(engine: EngineState, element: Element, tag: string) {
  var child = engine.firstOf(element)
  // The wildcard test is loop-invariant: any child qualifies.
  if (tag == '*') {
    return !!child
  }
  while (child) {
    if (engine.matchesTag(child, tag)) {
      return true
    }
    child = engine.nextOf(child)
  }
  return false
}
