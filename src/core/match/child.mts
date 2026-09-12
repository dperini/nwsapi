import type { EngineState } from '../state/engine.d.ts'
export function hasChild(engine: EngineState, element: Element, tag: string) {
  var child = engine.firstOf(element)
  while (child) {
    if (tag == '*' || engine.matchesTag(child, tag)) {
      return true
    }
    child = engine.nextOf(child)
  }
  return false
}
