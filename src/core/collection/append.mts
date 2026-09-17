import type { EngineState } from '../state/types.mts'
export function concatCall(
  _engine: EngineState,
  nodes: ArrayLike<Element>,
  callback: (element: Element) => unknown,
) {
  var i = 0,
    l = nodes.length,
    list = Array<Element>(l)
  while (l > i) {
    if (false === callback((list[i] = nodes[i]!))) {
      list.length = i + 1
      break
    }
    ++i
  }
  return list
}

export function concatList(
  _engine: EngineState,
  list: Element[],
  nodes: ArrayLike<Element>,
) {
  var i = -1,
    l = nodes.length
  while (l--) {
    list[list.length] = nodes[++i]!
  }
  return list
}
