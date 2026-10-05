import type { HostOptions, HostReaders, IdlUtils } from '../jsdom.mts'

interface TraversalCapabilities {
  up: boolean
  next: boolean
  prev: boolean
}

export function installTreeReaders(
  readers: HostReaders,
  document: Document,
  tree: NonNullable<HostOptions['domSymbolTree']>,
  implementation: Node,
  unwrap: (node: Node) => Node | undefined,
  utils: IdlUtils,
) {
  const probe = makeTreeProbe(document, utils)
  if (!probe) {
    return
  }
  const capabilities = probeTreeCapabilities(probe, implementation, tree, utils)
  if (capabilities.up && !readers.upOf) {
    readers.upOf = createTreeParentReader(tree, unwrap, utils)
  }
  if (capabilities.next && !readers.nextOf) {
    readers.nextOf = createTreeSiblingReader(
      tree.nextSibling,
      'nextSibling',
      unwrap,
      utils,
    )
  }
  if (capabilities.prev && !readers.prevOf) {
    readers.prevOf = createTreeSiblingReader(
      tree.previousSibling,
      'previousSibling',
      unwrap,
      utils,
    )
  }
}

function makeTreeProbe(document: Document, utils: IdlUtils) {
  try {
    const parent = document.createElement('i')
    const left = parent.appendChild(document.createElement('b'))
    parent.appendChild(document.createTextNode(''))
    parent.appendChild(document.createComment(''))
    const right = parent.appendChild(document.createElement('u'))
    const implementation = utils.implForWrapper!(parent)
    const leftImpl = utils.implForWrapper!(left)
    const rightImpl = utils.implForWrapper!(right)
    if (!implementation || !leftImpl || !rightImpl) {
      return undefined
    }
    return { parent, left, right, implementation, leftImpl, rightImpl }
  } catch {
    return undefined
  }
}

function probeTreeCapabilities(
  probe: NonNullable<ReturnType<typeof makeTreeProbe>>,
  implementation: Node,
  tree: NonNullable<HostOptions['domSymbolTree']>,
  utils: IdlUtils,
): TraversalCapabilities {
  return {
    up: probeTreeParent(probe, implementation, tree, utils),
    next: probeTreeSibling(
      probe.left,
      probe.right,
      probe.leftImpl,
      tree.nextSibling,
      utils,
    ),
    prev: probeTreeSibling(
      probe.right,
      probe.left,
      probe.rightImpl,
      tree.previousSibling,
      utils,
    ),
  }
}

function probeTreeParent(
  probe: NonNullable<ReturnType<typeof makeTreeProbe>>,
  implementation: Node,
  tree: NonNullable<HostOptions['domSymbolTree']>,
  utils: IdlUtils,
) {
  try {
    return (
      tree.parent(probe.leftImpl) === implementation &&
      utils.wrapperForImpl(implementation) === probe.parent &&
      utils.wrapperForImpl(probe.leftImpl) === probe.left
    )
  } catch {
    return false
  }
}

function probeTreeSibling(
  start: Element,
  expected: Element,
  implementation: Node,
  sibling: (node: Node) => Node | null,
  utils: IdlUtils,
) {
  try {
    return (
      utils.wrapperForImpl(implementation) === start &&
      findTreeElementSibling(implementation, sibling, utils) === expected
    )
  } catch {
    return false
  }
}

function createTreeParentReader(
  tree: NonNullable<HostOptions['domSymbolTree']>,
  unwrap: (node: Node) => Node | undefined,
  utils: IdlUtils,
) {
  let enabled = true
  return (node: Element) => {
    if (!enabled) {
      return node.parentElement
    }
    try {
      const implementation = unwrap(node)
      if (!implementation) {
        enabled = false
        return node.parentElement
      }
      const parent = tree.parent(implementation)
      if (!parent) {
        return null
      }
      const wrapper = utils.wrapperForImpl(parent)
      return wrapper.nodeType === 1 ? (wrapper as Element) : null
    } catch {
      enabled = false
      return node.parentElement
    }
  }
}

function createTreeSiblingReader(
  sibling: (node: Node) => Node | null,
  direction: 'nextSibling' | 'previousSibling',
  unwrap: (node: Node) => Node | undefined,
  utils: IdlUtils,
) {
  let enabled = true
  return (node: Element) => {
    if (!enabled) {
      return publicSibling(node, direction)
    }
    try {
      const implementation = unwrap(node)
      if (!implementation) {
        enabled = false
        return publicSibling(node, direction)
      }
      return findTreeElementSibling(implementation, sibling, utils)
    } catch {
      enabled = false
      return publicSibling(node, direction)
    }
  }
}

function publicSibling(
  node: Element,
  direction: 'nextSibling' | 'previousSibling',
) {
  return direction === 'nextSibling'
    ? node.nextElementSibling
    : node.previousElementSibling
}

function findTreeElementSibling(
  node: Node,
  sibling: (node: Node) => Node | null,
  utils: IdlUtils,
): Element | null {
  let current = sibling(node)
  while (current) {
    const wrapper = utils.wrapperForImpl(current)
    if (wrapper.nodeType === 1) {
      return wrapper as Element
    }
    current = sibling(current)
  }
  return null
}
