import type { EngineState } from '../state/engine.d.ts'
export function hasSlotted(
  engine: EngineState,
  element: Element,
  argument: string | null,
) {
  if (
    element.namespaceURI != 'http://www.w3.org/1999/xhtml' ||
    element.localName != 'slot'
  ) {
    return false
  }
  var slot = element as HTMLSlotElement
  if (typeof slot.assignedNodes != 'function') {
    return false
  }
  var nodes = slot.assignedNodes({ flatten: true })
  if (argument === null) {
    return nodes.length > 0
  }
  for (var i = 0, nodesLength = nodes.length; i < nodesLength; ++i) {
    if (
      nodes[i]!.nodeType == 1 &&
      engine.match(argument, nodes[i] as Element)
    ) {
      return true
    }
  }
  return false
}
