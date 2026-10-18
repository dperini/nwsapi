import type { EngineState } from '../../state/types.mts'

export interface TypePositions {
  nodes: Element[]
  positions?: WeakMap<Element, number>
}

export interface ParentPositions {
  parent: ParentNode | null
  types: Record<string, TypePositions>
}

export function createNthOfType(engine: EngineState) {
  var current: Element[] | undefined,
    currentIndex = 0,
    currentLength = 0,
    snapshots = createSnapshotStore(engine)

  return function (
    element: Element | null,
    dir: number,
    stable?: boolean,
  ): number {
    if (dir == 2) {
      snapshots = createSnapshotStore(engine)
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
      currentIndex = advanceStableCursor(current, currentIndex, element)
      return adjacent
    }

    const target = element!
    const local = engine.Config.LEGACY ? engine.tagOf(target) : target.localName
    const namespace = target.namespaceURI
    const name = typeName(engine, namespace, local)
    const parent = target.parentNode

    if (
      stable !== false &&
      !engine.Config.LEGACY &&
      parent &&
      parent.childElementCount <= 8
    ) {
      current = undefined
      currentIndex = 0
      currentLength = 0
      return scanTypePosition(target, local, namespace, dir)
    }

    // Callback queries can mutate siblings while candidates are visited.
    // Recompute only the requested rank so mutations stay visible.
    if (stable === false && !engine.Config.LEGACY) {
      current = undefined
      currentIndex = 0
      currentLength = 0
      return scanTypePosition(target, local, namespace, dir)
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
    currentIndex = positionOf(engine, type, target)
    return dir ? currentLength - currentIndex + 1 : currentIndex
  }
}

export function advanceStableCursor(
  current: Element[] | undefined,
  index: number,
  element: Element | null,
) {
  return current?.[index] === element ? index + 1 : index
}

export function createSnapshotStore(
  engine: EngineState,
): WeakMap<ParentNode, ParentPositions> | ParentPositions[] {
  return engine.primordials.WeakMapCtor
    ? engine.createWeakMap<ParentNode, ParentPositions>() || []
    : []
}

export function stablePosition(
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

export function getParentSnapshot(
  snapshots: WeakMap<ParentNode, ParentPositions> | ParentPositions[],
  parent: ParentNode | null,
  engine: EngineState,
  target: Element,
) {
  const key = parent || target
  if (Array.isArray(snapshots)) {
    for (let i = 0, length = snapshots.length; i < length; ++i) {
      if (snapshots[i]!.parent === parent) {
        return snapshots[i]!
      }
    }
  } else {
    const cached = snapshots.get(key)
    if (cached) {
      return cached
    }
  }
  const snapshot: ParentPositions = {
    parent,
    types: engine.primordials.ObjectCreate(null) as Record<
      string,
      TypePositions
    >,
  }
  if (Array.isArray(snapshots)) {
    snapshots[snapshots.length] = snapshot
  } else {
    snapshots.set(key, snapshot)
  }
  if (!engine.Config.LEGACY) {
    buildSnapshot(snapshot, engine, target)
  }
  return snapshot
}

export function getTypePositions(
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

export function buildSnapshot(
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
      snapshot.types[name] = type
    }
    type.nodes[type.nodes.length] = sibling
    node = sibling.nextElementSibling
  }
}

export function addPositions(engine: EngineState, type: TypePositions) {
  const WeakMapCtor = engine.primordials.WeakMapCtor
  if (!WeakMapCtor || type.nodes.length <= 8) {
    return undefined
  }

  const positions = new WeakMapCtor<Element, number>()
  for (let i = 0, length = type.nodes.length; i < length; ++i) {
    positions.set(type.nodes[i]!, i + 1)
  }
  type.positions = positions
  return positions
}

export function positionOf(
  engine: EngineState,
  type: TypePositions,
  target: Element,
) {
  if (type.nodes[0] === target) {
    return 1
  }
  if (type.positions) {
    return type.positions.get(target) || 1
  }
  if (type.nodes.length > 8 && engine.primordials.WeakMapCtor) {
    return addPositions(engine, type)?.get(target) || 1
  }
  return findPosition(type.nodes, target)
}

export function scanTypePosition(
  target: Element,
  local: string,
  namespace: string | null,
  dir: number,
) {
  let position = 1
  let sibling = dir ? target.nextElementSibling : target.previousElementSibling
  while (sibling) {
    if (sibling.localName === local && sibling.namespaceURI === namespace) {
      ++position
    }
    sibling = dir ? sibling.nextElementSibling : sibling.previousElementSibling
  }
  return position
}

export function typeName(
  engine: EngineState,
  namespace: string | null,
  local: string,
) {
  return namespace == engine.NAMESPACE
    ? local
    : (namespace || '') + '\x00' + local
}

export function findPosition(nodes: Element[], target: Element) {
  for (let i = 0, length = nodes.length; i < length; ++i) {
    if (nodes[i] === target) {
      return i + 1
    }
  }
  return 1
}
