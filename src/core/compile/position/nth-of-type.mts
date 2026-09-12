import type { EngineState } from '../../state/engine.d.ts'
export function createNthOfType(engine: EngineState) {
  var idx = 0,
    len = 0,
    set = 0,
    current: Element[] | undefined,
    parent: ParentNode | null | undefined = undefined,
    parents = Array<ParentNode | null>(),
    nodes = Array<Record<string, Element[]>>()
  return function (
    element: Element | null,
    dir: number,
    stable?: boolean,
  ): number {
    var loadTypeSiblingSetDone = false
    var loadTypeSiblingSetValue!: number

    // ensure caches are emptied after each run, invoking with dir = 2
    if (dir == 2) {
      idx = 0
      len = 0
      set = 0
      nodes.length = 0
      parents.length = 0
      parent = undefined
      current = undefined
      return -1
    }
    // Adjacent candidates already identify their type and parent. Reuse
    // that identity before paying for three more DOM property reads.
    const previous = stablePosition()
    if (previous !== undefined) {
      return previous
    }
    current = undefined
    var e: Element | Element[] | null,
      i!: number,
      j!: number,
      k: number,
      l!: number,
      local = engine.Config.LEGACY
        ? engine.tagOf(element!)
        : element!.localName,
      namespace = element!.namespaceURI,
      name =
        namespace == engine.NAMESPACE
          ? local
          : (namespace || '') + '\x00' + local
    if (resolveSiblingSet()) {
      return loadTypeSiblingSetValue
    }
    if (
      element !== nodes[i]![name]![j] &&
      element !== nodes[i]![name]![(j = 0)]
    ) {
      for (j = 0, e = nodes[i]![name]!, k = l - 1; l > j; ++j, --k) {
        if ((e as Element[])[j] === element) {
          break
        }
        if ((e as Element[])[k] === element) {
          j = k
          break
        }
      }
    }
    current = nodes[i]![name]
    idx = j + 1
    len = l
    return dir ? l - j : idx

    function stablePosition() {
      if (stable && current) {
        if (current[idx] === element) {
          ++idx
          return dir ? len - idx + 1 : idx
        }
        if (current[idx - 1] === element) {
          return dir ? len - idx + 1 : idx
        }
      }

      return undefined
    }

    function resolveSiblingSet() {
      if (nodes[set]! && nodes[set]![name]! && parent === element!.parentNode) {
        i = set
        j = idx
        l = len
      } else {
        l = parents.length
        parent = element!.parentNode
        for (i = -1, j = 0, k = l - 1; l > j; ++j, --k) {
          if (parents[j] === parent) {
            i = j
            break
          }
          if (parents[k] === parent) {
            i = k
            break
          }
        }
        {
          loadTypeSiblingSet()
          if (loadTypeSiblingSetDone) {
            return true
          }
        }
      }

      return false
    }

    function loadTypeSiblingSet() {
      if (i < 0 || !nodes[i]![name]!) {
        parents[(i = l)] = parent!
        nodes[i]! || (nodes[i] = engine.primordials.ObjectCreate(null))
        l = 0
        nodes[i]![name] = Array<Element>()
        e = parent ? engine.firstOf(parent) || element : element
        if (engine.Config.LEGACY) {
          var siblings = engine.legacyHooks!.siblings(
            e as Element | null,
            element!,
            local,
            namespace,
          )
          nodes[i]![name] = siblings.nodes
          j = siblings.index
          l = siblings.nodes.length
        } else {
          while (e) {
            if (e === element) {
              j = l
            }
            if (
              (e as Element).localName == local &&
              (e as Element).namespaceURI == namespace
            ) {
              nodes[i]![name]![l] = e as Element
              ++l
            }
            e = (e as Element).nextElementSibling
          }
        }
        set = i
        idx = j
        len = l
        if (l < 2) {
          {
            loadTypeSiblingSetValue = l
            loadTypeSiblingSetDone = true
            return
          }
        }
      } else {
        l = nodes[i]![name]!.length
        set = i
      }
    }
  }
}
