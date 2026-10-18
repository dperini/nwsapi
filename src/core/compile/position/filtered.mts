import type {
  CompiledResolver,
  EngineState,
  FilteredNthState,
} from '../../state/types.mts'

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
    resolvers: CompiledResolver[] | undefined,
    child,
    index,
    typeNames = simpleTypeNames(engine, selector, state)
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
      if (!typeNames) {
        resolvers = engine.matchResolvers.get('false:' + selector)
        if (!resolvers) {
          resolvers = engine.match_collect(
            engine.parse(selector, false) as string[],
            undefined,
          )
          engine.matchResolvers.set('false:' + selector, resolvers)
        }
      }
      child = element.parentNode ? engine.firstOf(parent) : element
      while (child) {
        if (
          typeNames
            ? matchesSimpleType(engine, child, typeNames)
            : engine.match_assert(resolvers!, child, undefined)
        ) {
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

function simpleTypeNames(
  engine: EngineState,
  selector: string,
  state: FilteredNthState | null,
) {
  if (!engine.HTML_DOCUMENT || engine.Config.LEGACY) {
    return null
  }
  if (state?.typeSelector === selector) {
    return state.typeNames
  }
  const match =
    /^[\t\n\f\r ]*([a-z][a-z0-9-]*)(?:[\t\n\f\r ]*,[\t\n\f\r ]*([a-z][a-z0-9-]*))*[\t\n\f\r ]*$/i.exec(
      selector,
    )
  const names = match
    ? selector.split(',').map(name => engine.asciiLower(name.trim()))
    : null
  if (state) {
    state.typeSelector = selector
    state.typeNames = names
  }
  return names
}

function matchesSimpleType(
  engine: EngineState,
  element: Element,
  names: string[],
) {
  return names.includes(engine.asciiLower(engine.tagOf(element)))
}
