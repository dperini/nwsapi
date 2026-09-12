import type { EngineState, EngineContext } from '../state/types.mts'

export function byClass(
  engine: EngineState,
  cls: string,
  context: EngineContext,
) {
  var e: Element | null,
    nodes: Element[],
    api = engine.method['.'],
    reCls: RegExp
  if (engine.Config.LEGACY) {
    nodes = engine.legacyHooks!.byClass(cls, context)
  } else if (api in context) {
    return engine.collectionCopy(context[api]!(cls), context)
  } else {
    // DOCUMENT_FRAGMENT_NODE (11)
    if ((e = context.firstElementChild)) {
      reCls = RegExp('(^|\\s)' + cls + '(\\s|$)', engine.QUIRKS_MODE ? 'i' : '')
      if (!(e.nextElementSibling || reCls.test(e.className))) {
        return engine.sliceCall(e[api](cls))
      } else {
        nodes = []
        do {
          if (reCls.test(e.className)) {
            nodes[nodes.length] = e
          }
          engine.concatList(nodes, e[api](cls))
        } while ((e = e.nextElementSibling))
      }
    } else {
      nodes = engine.none
    }
  }
  return !engine.Config.NODE_LIST
    ? nodes
    : engine.isInstanceOf(nodes)
      ? nodes
      : engine.toNodeList(nodes)
}
