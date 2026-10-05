import type { FirstPositionState } from '../../state/types.mts'

export function firstPosition(element: Element, state: FirstPositionState) {
  if (element === state.element) {
    return state.index
  }
  var node = element.previousElementSibling,
    index = 1
  while (node) {
    if (node === state.element) {
      index += state.index
      break
    }
    ++index
    node = node.previousElementSibling
  }
  state.element = element
  state.index = index
  return index
}
