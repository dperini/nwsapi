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
      siblings = { nodes: [], positions: undefined }
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
      if (typeNames) {
        child = element.parentNode
          ? (parent as ParentNode).firstElementChild
          : element
        while (child) {
          if (matchesSimpleType(engine, child, typeNames)) {
            keepFilteredSibling(engine, siblings, child)
          }
          child = child.nextElementSibling
        }
      } else {
        child = element.parentNode ? engine.firstOf(parent) : element
        while (child) {
          if (engine.match_assert(resolvers!, child, undefined)) {
            keepFilteredSibling(engine, siblings, child)
          }
          child = engine.nextOf(child)
        }
      }
      if (state) {
        state.parents || (state.parents = engine.createWeakMap())
        state.parents && state.parents.set(parent, siblings)
      }
    }
    return siblings
  }
}

function keepFilteredSibling(
  engine: EngineState,
  siblings: {
    nodes: Element[]
    positions: WeakMap<Element, number> | undefined
  },
  child: Element,
) {
  const nodes = siblings.nodes
  nodes[nodes.length] = child
  if (siblings.positions) {
    siblings.positions.set(child, nodes.length)
  } else if (nodes.length > 8 && engine.primordials.WeakMapCtor) {
    const positions = engine.createWeakMap<Element, number>()
    if (positions) {
      siblings.positions = positions
      for (let index = 0, length = nodes.length - 1; index < length; ++index) {
        positions.set(nodes[index]!, index + 1)
      }
      positions.set(child, nodes.length)
    }
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
  const local = engine.tagOf(element)
  const name =
    element.namespaceURI == engine.NAMESPACE ? local : engine.asciiLower(local)
  if (names.length == 2) {
    return name == names[0] || name == names[1]
  }
  return names.includes(name)
}
