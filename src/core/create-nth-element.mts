import type { EngineState } from './state.d.ts'
export function createNthElement(engine: EngineState) {
  var idx = 0,
    len = 0,
    set = 0,
    parent: ParentNode | null | undefined = undefined,
    parents = Array<ParentNode | null>(),
    nodes = Array<Element[]>()
  return function (element: Element | null, dir: number): number {
    var loadSiblingSetDone = false
    var loadSiblingSetValue!: number

    // ensure caches are emptied after each run, invoking with dir = 2
    if (dir == 2) {
      idx = 0
      len = 0
      set = 0
      nodes.length = 0
      parents.length = 0
      parent = undefined
      return -1
    }
    var e: Element | Element[] | null,
      i!: number,
      j!: number,
      k: number,
      l!: number,
      p = engine.Config.LEGACY ? engine.upOf(element!) : element!.parentNode
    {
      loadSiblingSet()
      if (loadSiblingSetDone) {
        return loadSiblingSetValue
      }
    }
    if (element !== nodes[i]![j] && element !== nodes[i]![(j = 0)]) {
      for (j = 0, e = nodes[i]!, k = l - 1; l > j; ++j, --k) {
        if ((e as Element[])[j] === element) {
          break
        }
        if ((e as Element[])[k] === element) {
          j = k
          break
        }
      }
    }
    idx = j + 1
    len = l
    return dir ? l - j : idx

    function loadSiblingSet() {
      if (parent === p) {
        i = set
        j = idx
        l = len
      } else {
        l = parents.length
        parent = p
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
        if (i < 0) {
          parents[(i = l)] = parent!
          l = 0
          nodes[i] = Array<Element>()
          e = parent ? engine.firstOf(parent) || element : element
          if (engine.Config.LEGACY) {
            var siblings = engine.legacyHooks!.siblings(
              e as Element | null,
              element!,
            )
            nodes[i] = siblings.nodes
            j = siblings.index
            l = siblings.nodes.length
          } else {
            while (e) {
              nodes[i]![l] = e as Element
              if (e === element) {
                j = l
              }
              e = (e as Element).nextElementSibling
              ++l
            }
          }
          set = i
          idx = 0
          len = l
          if (l < 2) {
            {
              loadSiblingSetValue = l
              loadSiblingSetDone = true
              return
            }
          }
        } else {
          l = nodes[i]!.length
          set = i
        }
      }
    }
  }
}
