import { isCssWhitespace } from '../predicate/css-whitespace.mts'
import type { EngineState, EngineContext } from '../state/types.mts'

export function byClass(
  engine: EngineState,
  cls: string,
  context: EngineContext,
) {
  var e: Element | null,
    nodes: Element[],
    api = engine.method['.'],
    reCls: RegExp | null
  if (engine.Config.LEGACY) {
    nodes = engine.legacyHooks!.byClass(cls, context)
  } else if (api in context) {
    return engine.collectionCopy(context[api]!(cls), context)
  } else {
    // DOCUMENT_FRAGMENT_NODE (11). Standards mode scans for the token
    // directly, the same rule hosts apply to the class attribute;
    // quirks mode needs the case-insensitive regex.
    if ((e = context.firstElementChild)) {
      reCls = engine.QUIRKS_MODE
        ? RegExp('(^|\\s)' + cls + '(\\s|$)', 'i')
        : null
      if (!(e.nextElementSibling || hasToken(e))) {
        return engine.sliceCall(e[api](cls))
      } else {
        nodes = []
        do {
          if (hasToken(e)) {
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

  function hasToken(element: Element) {
    return reCls
      ? reCls.test(element.className)
      : hasClass(engine, element.className, cls)
  }
}

// Class tokens are separated by ASCII whitespace, the same boundary
// rule hosts apply when they tokenize the class attribute. Scanning
// for a token skips the regex execution a per-element class test
// would otherwise pay.
export function hasClass(_engine: EngineState, value: string, name: string) {
  var offset = -1,
    before: number,
    after: number
  while (value && (offset = value.indexOf(name, offset + 1)) >= 0) {
    before = offset ? value.charCodeAt(offset - 1) : 32 /* space */
    after =
      offset + name.length < value.length
        ? value.charCodeAt(offset + name.length)
        : 32 /* space */
    if (isCssWhitespace(before) && isCssWhitespace(after)) {
      return true
    }
  }
  return false
}
