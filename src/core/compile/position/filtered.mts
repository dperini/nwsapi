import type { EngineState, FilteredNthState } from '../../state/types.mts'

export function nthFiltered(
  engine: EngineState,
  element: Element,
  selector: string,
  reverse: boolean,
  state: FilteredNthState | null,
) {
  var parent = element.parentNode || element,
    siblings =
      state &&
      (state.parent === parent
        ? state.siblings
        : state.parents && state.parents.get(parent)),
    resolvers,
    child,
    index
  {
    siblings = collectFilteredSiblings()
  }
  if (state) {
    state.parent = parent
    state.siblings = siblings
  }
  index = siblings.positions
    ? siblings.positions.get(element) || 0
    : siblings.nodes.indexOf(element) + 1
  return index && reverse ? siblings.nodes.length - index + 1 : index

  function collectFilteredSiblings() {
    if (!siblings) {
      siblings = { nodes: [], positions: engine.createWeakMap() }
      resolvers = engine.matchResolvers.get('false:' + selector)
      if (!resolvers) {
        resolvers = engine.match_collect(
          engine.parse(selector, false) as string[],
          undefined,
        )
        engine.matchResolvers.set('false:' + selector, resolvers)
      }
      child = element.parentNode ? engine.firstOf(parent) : element
      while (child) {
        if (engine.match_assert(resolvers, child, undefined)) {
          siblings.nodes[siblings.nodes.length] = child
          siblings.positions &&
            siblings.positions.set(child, siblings.nodes.length)
        }
        child = engine.nextOf(child)
      }
      if (state) {
        state.parents || (state.parents = engine.createWeakMap())
        state.parents && state.parents.set(parent, siblings)
      }
    }
    return siblings
  }
}
