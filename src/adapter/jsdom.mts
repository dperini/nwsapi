import { installTreeReaders } from './host/tree.mts'

export interface HostReaders {
  attrOf?(element: Element, name: string): string | null
  hasAttrOf?(element: Element, name: string): boolean
  upOf?(element: Element): Element | null
  nextOf?(element: Element): Element | null
  prevOf?(element: Element): Element | null
}

export type IdlUtils = {
  wrapperForImpl(node: unknown): Node
  implForWrapper?(node: Node): Node | undefined
}

export type HostOptions = {
  idlUtils?: IdlUtils
  domSymbolTree?: {
    parent(node: Node): Node | null
    nextSibling(node: Node): Node | null
    previousSibling(node: Node): Node | null
  }
}

// Use the utilities supplied by the host, never a separately imported copy.
export function createHostReaders(
  document: Document,
  options: HostOptions,
): HostReaders | undefined {
  const utils = options.idlUtils
  if (!utils || typeof utils.implForWrapper !== 'function') {
    return undefined
  }

  const unwrap = utils.implForWrapper.bind(utils)
  const probe = document.createElement('i')
  const implementation = unwrapSafely(probe, unwrap)
  const readers: HostReaders = {}
  installAttributeReaders(readers, probe, implementation, utils, unwrap)

  // Prefer implementation-node getters, then fill unsupported directions
  // from the older host-supplied tree helper when it is available.
  const direct = probeDirectTraversal(document, probe, implementation, utils)
  if (direct && direct.up) {
    readers.upOf = direct.up
  }
  if (direct && direct.next) {
    readers.nextOf = direct.next
  }
  if (direct && direct.prev) {
    readers.prevOf = direct.prev
  }

  const tree = options.domSymbolTree
  if (tree && implementation) {
    installTreeReaders(readers, document, tree, implementation, unwrap, utils)
  }
  return readers
}

function unwrapSafely(node: Node, unwrap: (node: Node) => Node | undefined) {
  try {
    return unwrap(node)
  } catch {
    return undefined
  }
}

function installAttributeReaders(
  readers: HostReaders,
  probe: Element,
  implementation: Node | undefined,
  utils: IdlUtils,
  unwrap: (node: Node) => Node | undefined,
) {
  if (!implementation) {
    return
  }
  const element = implementation as Element
  if (probeAttributeReader(probe, element, utils, 'getAttribute')) {
    readers.attrOf = (node, name) => readAttribute(node, name, unwrap)
  }
  if (probeAttributeReader(probe, element, utils, 'hasAttribute')) {
    readers.hasAttrOf = (node, name) => readHasAttribute(node, name, unwrap)
  }
}

function probeAttributeReader(
  probe: Element,
  implementation: Element,
  utils: IdlUtils,
  method: 'getAttribute' | 'hasAttribute',
) {
  try {
    const name = 'data-nwsapi-probe-' + method
    if (
      utils.wrapperForImpl(implementation) !== probe ||
      typeof implementation[method] !== 'function' ||
      (method === 'getAttribute'
        ? implementation.getAttribute(name) !== null
        : implementation.hasAttribute(name))
    ) {
      return false
    }
    probe.setAttribute(name, '')
    return method === 'getAttribute'
      ? implementation.getAttribute(name) === ''
      : implementation.hasAttribute(name)
  } catch {
    return false
  }
}

function readAttribute(
  node: Element,
  name: string,
  unwrap: (node: Node) => Node | undefined,
) {
  try {
    const implementation = unwrap(node) as Element | undefined
    if (implementation && typeof implementation.getAttribute === 'function') {
      return implementation.getAttribute(name)
    }
  } catch {
    // Disable only this call path by using the public read below.
  }
  return node.getAttribute(name)
}

function readHasAttribute(
  node: Element,
  name: string,
  unwrap: (node: Node) => Node | undefined,
) {
  try {
    const implementation = unwrap(node) as Element | undefined
    if (implementation && typeof implementation.hasAttribute === 'function') {
      return implementation.hasAttribute(name)
    }
  } catch {
    // Disable only this call path by using the public read below.
  }
  return node.hasAttribute(name)
}

interface TraversalCapabilities {
  up: boolean
  next: boolean
  prev: boolean
}

function probeDirectTraversal(
  document: Document,
  probe: Element,
  probeImpl: Node | undefined,
  utils: IdlUtils,
) {
  if (!probeImpl || !utils.implForWrapper) {
    return undefined
  }
  const { child, tail, childImpl, tailImpl } = makeProbeChildren(
    document,
    probe,
    utils,
  )
  if (!child || !tail || !childImpl || !tailImpl) {
    return undefined
  }
  const capabilities = probeDirectCapabilities(
    probe,
    probeImpl,
    child,
    tail,
    childImpl,
    tailImpl,
    utils,
  )
  if (!capabilities.up && !capabilities.next && !capabilities.prev) {
    return undefined
  }
  return {
    up: capabilities.up ? createDirectParentReader(utils) : undefined,
    next: capabilities.next
      ? createDirectSiblingReader('nextSibling', utils)
      : undefined,
    prev: capabilities.prev
      ? createDirectSiblingReader('previousSibling', utils)
      : undefined,
  }
}

function makeProbeChildren(
  document: Document,
  probe: Element,
  utils: IdlUtils,
) {
  try {
    const child = document.createElement('b')
    const tail = document.createElement('u')
    probe.appendChild(child)
    probe.appendChild(document.createTextNode(''))
    probe.appendChild(document.createComment(''))
    probe.appendChild(tail)
    return {
      child,
      tail,
      childImpl: utils.implForWrapper!(child),
      tailImpl: utils.implForWrapper!(tail),
    }
  } catch {
    return {}
  }
}

function probeDirectCapabilities(
  probe: Element,
  probeImpl: Node,
  child: Element,
  tail: Element,
  childImpl: Node,
  tailImpl: Node,
  utils: IdlUtils,
): TraversalCapabilities {
  return {
    up: probeDirectParent(probe, probeImpl, childImpl, utils),
    next: probeDirectSibling(child, tail, childImpl, 'nextSibling', utils),
    prev: probeDirectSibling(tail, child, tailImpl, 'previousSibling', utils),
  }
}

function probeDirectParent(
  probe: Element,
  probeImpl: Node,
  childImpl: Node,
  utils: IdlUtils,
) {
  try {
    const parent = (childImpl as Node & { parentNode?: Node | null }).parentNode
    return parent === probeImpl && utils.wrapperForImpl(parent) === probe
  } catch {
    return false
  }
}

function probeDirectSibling(
  start: Element,
  expected: Element,
  implementation: Node,
  direction: 'nextSibling' | 'previousSibling',
  utils: IdlUtils,
) {
  try {
    if (utils.wrapperForImpl(implementation) !== start) {
      return false
    }
    const sibling = (implementation as Node & { [key: string]: Node | null })[
      direction
    ]
    return (
      sibling !== undefined &&
      findElementSibling(sibling, direction, utils) === expected
    )
  } catch {
    return false
  }
}

function createDirectParentReader(utils: IdlUtils) {
  let enabled = true
  return (node: Element) => {
    if (!enabled) {
      return node.parentElement
    }
    try {
      const implementation = utils.implForWrapper!(node) as
        | (Node & { parentNode?: Node | null })
        | undefined
      if (!implementation) {
        enabled = false
        return node.parentElement
      }
      const parent = implementation.parentNode
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

function createDirectSiblingReader(
  direction: 'nextSibling' | 'previousSibling',
  utils: IdlUtils,
) {
  let enabled = true
  return (node: Element) => {
    if (!enabled) {
      return publicSibling(node, direction)
    }
    try {
      const implementation = utils.implForWrapper!(node) as
        | (Node & { [key: string]: Node | null | undefined })
        | undefined
      if (!implementation || implementation[direction] === undefined) {
        enabled = false
        return publicSibling(node, direction)
      }
      return findElementSibling(implementation[direction], direction, utils)
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

function findElementSibling(
  node: Node | null | undefined,
  direction: 'nextSibling' | 'previousSibling',
  utils: IdlUtils,
) {
  let current = node
  while (current) {
    const wrapper = utils.wrapperForImpl(current)
    if (wrapper.nodeType === 1) {
      return wrapper as Element
    }
    current = (current as Node & { [key: string]: Node | null | undefined })[
      direction
    ]
  }
  return null
}
