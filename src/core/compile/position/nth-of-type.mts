import type { EngineState } from '../../state/types.mts'

interface TypePositions {
  nodes: Element[]
  positions?: WeakMap<Element, number>
}

interface ParentPositions {
  parent: ParentNode | null
  types: Record<string, TypePositions>
}

export function createNthOfType(engine: EngineState) {
  var current: Element[] | undefined,
    currentIndex = 0,
    currentLength = 0,
    snapshots = Array<ParentPositions>()

  return function (
    element: Element | null,
    dir: number,
    stable?: boolean,
  ): number {
    if (dir == 2) {
      snapshots.length = 0
      current = undefined
      currentIndex = 0
      currentLength = 0
      return -1
    }

    const adjacent = stablePosition(
      current,
      currentIndex,
      currentLength,
      element,
      dir,
      stable,
    )
    if (adjacent !== undefined) {
      return adjacent
    }

    const target = element!
    const local = engine.Config.LEGACY ? engine.tagOf(target) : target.localName
    const namespace = target.namespaceURI
    const name = typeName(engine, namespace, local)
    const parent = target.parentNode

    // Callback queries can mutate siblings while candidates are visited.
    // Recompute those positions instead of retaining a parent snapshot.
    if (stable === false && !engine.Config.LEGACY) {
      return scanPosition(engine, parent, target, local, namespace, dir)
    }

    const snapshot = getParentSnapshot(snapshots, parent, engine, target)
    const type = getTypePositions(
      engine,
      snapshot,
      target,
      name,
      local,
      namespace,
    )
    if (!type) {
      current = undefined
      return 1
    }

    current = type.nodes
    currentLength = type.nodes.length
    currentIndex = type.positions
      ? type.positions.get(target) || 1
      : findPosition(type.nodes, target)
    return dir ? currentLength - currentIndex + 1 : currentIndex
  }
}

function stablePosition(
  current: Element[] | undefined,
  index: number,
  length: number,
  element: Element | null,
  dir: number,
  stable?: boolean,
) {
  if (!stable || !current) {
    return undefined
  }
  if (current[index] === element) {
    ++index
    return dir ? length - index + 1 : index
  }
  if (current[index - 1] === element) {
    return dir ? length - index + 1 : index
  }
  return undefined
}

function getParentSnapshot(
  snapshots: ParentPositions[],
  parent: ParentNode | null,
  engine: EngineState,
  target: Element,
) {
  for (let i = 0, length = snapshots.length; i < length; ++i) {
    if (snapshots[i]!.parent === parent) {
      return snapshots[i]!
    }
  }
  const snapshot: ParentPositions = {
    parent,
    types: engine.primordials.ObjectCreate(null) as Record<
      string,
      TypePositions
    >,
  }
  snapshots[snapshots.length] = snapshot
  if (!engine.Config.LEGACY) {
    buildSnapshot(snapshot, engine, target)
  }
  return snapshot
}

function getTypePositions(
  engine: EngineState,
  snapshot: ParentPositions,
  target: Element,
  name: string,
  local: string,
  namespace: string | null,
) {
  let type = snapshot.types[name]
  if (type || !engine.Config.LEGACY) {
    return type
  }

  const parent = snapshot.parent
  const start = parent ? engine.firstOf(parent) || target : target
  const siblings = engine.legacyHooks!.siblings(
    start as Element,
    target,
    local,
    namespace,
  )
  type = { nodes: siblings.nodes }
  addPositions(engine, type)
  snapshot.types[name] = type
  return type
}

function buildSnapshot(
  snapshot: ParentPositions,
  engine: EngineState,
  target: Element,
) {
  let node = snapshot.parent ? engine.firstOf(snapshot.parent) : target
  while (node) {
    const sibling = node as Element
    const name = typeName(engine, sibling.namespaceURI, sibling.localName)
    let type = snapshot.types[name]
    if (!type) {
      type = { nodes: [] }
      addPositions(engine, type)
      snapshot.types[name] = type
    }
    type.nodes[type.nodes.length] = sibling
    type.positions?.set(sibling, type.nodes.length)
    node = sibling.nextElementSibling
  }
}

function addPositions(engine: EngineState, type: TypePositions) {
  const WeakMapCtor = engine.primordials.WeakMapCtor
  if (WeakMapCtor) {
    type.positions = new WeakMapCtor<Element, number>()
    for (let i = 0, length = type.nodes.length; i < length; ++i) {
      type.positions.set(type.nodes[i]!, i + 1)
    }
  }
}

function scanPosition(
  engine: EngineState,
  parent: ParentNode | null,
  target: Element,
  local: string,
  namespace: string | null,
  dir: number,
) {
  let node = parent ? engine.firstOf(parent) : target
  let index = 0
  let total = 0
  while (node) {
    const sibling = node as Element
    if (sibling.localName === local && sibling.namespaceURI === namespace) {
      ++total
      if (sibling === target) {
        index = total
      }
    }
    node = sibling.nextElementSibling
  }
  const position = index || 1
  return dir ? total - position + 1 : position
}

function typeName(
  engine: EngineState,
  namespace: string | null,
  local: string,
) {
  return namespace == engine.NAMESPACE
    ? local
    : (namespace || '') + '\x00' + local
}

function findPosition(nodes: Element[], target: Element) {
  for (let i = 0, length = nodes.length; i < length; ++i) {
    if (nodes[i] === target) {
      return i + 1
    }
  }
  return 1
}
