import type { EngineState } from '../state/engine.d.ts'
import type { EngineContext } from '../state/types.mts'
export function byIdRaw(
  engine: EngineState,
  id: string,
  context: EngineContext,
  from?: Element,
): Element[] {
  var node: EngineContext | null = context,
    nodes: Element[] = [],
    next

  if (engine.Config.LEGACY) {
    return engine.legacyHooks!.byIdRaw(id, context, from)
  }

  next = from || node.firstElementChild
  while ((node = next)) {
    ;(node as Element).id == id && (nodes[nodes.length] = node as Element)
    if (
      (next = node.firstElementChild || (node as Element).nextElementSibling)
    ) {
      continue
    }
    while (!next && (node = node.parentElement) && node !== context) {
      next = (node as Element).nextElementSibling
    }
  }
  return nodes
}

export function byId(
  engine: EngineState,
  id: string,
  context: EngineContext,
): Element[] {
  var findIdCandidatesDone = false
  var findIdCandidatesValue!: Element[]

  var e,
    i: number,
    l: number,
    nodes,
    lookupRoot,
    api = engine.method['#']

  // duplicates id allowed
  {
    findIdCandidates()
    if (findIdCandidatesDone) {
      return findIdCandidatesValue
    }
  }

  // Without document.all — jsdom does not implement it — every '#id'
  // used to walk the whole subtree, which measures 2.5ms against 43ns
  // for getElementById on a 6300-element document. getElementById cannot
  // answer on its own, because a document may carry the same id more
  // than once and all of them match, but it does settle two things in
  // constant time: whether the id exists anywhere, and where the first
  // one is, since it returns the first in tree order and any duplicate
  // has to follow it.
  // A connected element may belong to a shadow tree. Only its actual
  // document root can prove absence through the document's ID map.
  lookupRoot =
    context.nodeType == 9
      ? context
      : context.getRootNode
        ? context.getRootNode()
        : null
  if (lookupRoot && lookupRoot.nodeType == 9) {
    e = (lookupRoot as Document).getElementById(id)
    if (!e) {
      return engine.none
    }
    if (context.nodeType == 9) {
      return engine.byIdRaw(id, context, e)
    }
  }

  return engine.byIdRaw(id, context)

  function findIdCandidates() {
    if (engine.Config.IDS_DUPES === false) {
      if (api in context) {
        {
          findIdCandidatesValue = (e = context[api]!(id)) ? [e] : engine.none
          findIdCandidatesDone = true
          return
        }
      }
    } else {
      if ('all' in context) {
        if (
          (e = (
            context.all as HTMLAllCollection &
              Record<string, Element | HTMLCollectionOf<Element> | number>
          )[id])
        ) {
          if ((e as Element).nodeType == 1) {
            {
              findIdCandidatesValue =
                engine.attrOf(e as Element, 'id') != id ? [] : [e as Element]
              findIdCandidatesDone = true
              return
            }
          } else if (id == 'length') {
            {
              findIdCandidatesValue = (e = context[api]!(id))
                ? [e]
                : engine.none
              findIdCandidatesDone = true
              return
            }
          }
          for (
            i = 0, l = (e as HTMLCollectionOf<Element>).length, nodes = [];
            l > i;
            ++i
          ) {
            if (
              (e as ArrayLike<Element>)[i]! &&
              (e as ArrayLike<Element>)[i]!.nodeType == 1 &&
              engine.idOf((e as ArrayLike<Element>)[i]!) == id
            ) {
              nodes[nodes.length] = (e as ArrayLike<Element>)[i]!
            }
          }
          {
            findIdCandidatesValue = nodes
            findIdCandidatesDone = true
            return
          }
        } else {
          {
            findIdCandidatesValue = engine.none
            findIdCandidatesDone = true
            return
          }
        }
      }
    }
  }
}
