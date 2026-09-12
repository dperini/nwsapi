import type { EngineState } from '../state/types.mts'
export function ancestor(
  engine: EngineState,
  selectors: string,
  element: Element | null,
  callback: ((element: Element) => unknown) | undefined,
) {
  engine.parse(selectors, true)
  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }
  var previousScope = engine.Snapshot.from
  engine.Snapshot.from = element || engine.doc
  try {
    while (element) {
      if (engine.match(selectors, element, callback)) {
        break
      }
      element = engine.upOf(element)
    }
    return element
  } finally {
    engine.Snapshot.from = previousScope
  }
}
