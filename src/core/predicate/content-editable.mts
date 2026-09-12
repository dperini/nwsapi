import type { EngineState, EngineElement } from '../state/types.mts'

export function isContentEditable(
  engine: EngineState,
  node: EngineElement,
): boolean {
  // designMode makes every connected element in this document editable,
  // including descendants with contenteditable=false.
  if (
    node.ownerDocument &&
    node.ownerDocument.designMode === 'on' &&
    engine.connectedOf(node)
  ) {
    return true
  }
  var attrValue: string | null = 'inherit'
  if (engine.hasAttrOf(node, 'contenteditable')) {
    attrValue = engine.attrOf(node, 'contenteditable')
  }
  switch (attrValue) {
    case '':
    case 'plaintext-only':
    case 'true':
      return true
    case 'false':
      return false
    default:
      if (node.parentNode && node.parentNode.nodeType === 1) {
        return engine.isContentEditable(node.parentNode as EngineElement)
      }
      return false
  }
}
