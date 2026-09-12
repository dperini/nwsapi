import type { EngineState } from '../state/engine.d.ts'
export function documentOrder(engine: EngineState, a: Element, b: Element) {
  if (!engine.hasDupes && a === b) {
    engine.hasDupes = true
    return 0
  }
  return a.compareDocumentPosition(b) & 4 ? -1 : 1
}

export function mergeResults(
  engine: EngineState,
  nodes: Element[],
  ends: number[],
) {
  var length = nodes.length,
    count = ends.length - 1,
    output: Element[],
    swap: Element[],
    width: number,
    group: number,
    i: number,
    j: number,
    end: number,
    middle: number,
    out: number,
    a: Element,
    b: Element
  if (length < 2 || count < 2) {
    return nodes
  }
  for (group = 1; group < count; ++group) {
    i = ends[group]!
    a = nodes[i - 1]!
    b = nodes[i]!
    if (a === b || !(a.compareDocumentPosition(b) & 4)) {
      break
    }
  }
  if (group == count) {
    return nodes
  }
  output = Array<Element>(length)
  {
    mergeSortedGroups()
  }
  return engine.hasDupes ? engine.unique(nodes) : nodes

  function mergeSortedGroups() {
    for (width = 1; width < count; width *= 2) {
      for (group = 0; group < count; group += width * 2) {
        i = ends[group]!
        middle = ends[Math.min(group + width, count)]!
        j = middle
        end = ends[Math.min(group + width * 2, count)]!
        out = i
        while (i < middle && j < end) {
          a = nodes[i]!
          b = nodes[j]!
          if (a === b) {
            engine.hasDupes = true
            output[out++] = a
            ++i
          } else if (a.compareDocumentPosition(b) & 4) {
            output[out++] = a
            ++i
          } else {
            output[out++] = b
            ++j
          }
        }
        while (i < middle) {
          output[out++] = nodes[i++]!
        }
        while (j < end) {
          output[out++] = nodes[j++]!
        }
      }
      swap = nodes
      nodes = output
      output = swap
    }
  }
}

export function unique(engine: EngineState, nodes: Element[]) {
  var i = 0,
    j = -1,
    l = nodes.length + 1,
    list = []
  while (--l) {
    if (nodes[i++] === nodes[i]) {
      continue
    }
    list[++j] = nodes[i - 1]!
  }
  engine.hasDupes = false
  return list
}
