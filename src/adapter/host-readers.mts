import type { HostReaders } from './host.d.ts'

export function validAttributeReader(
  probe: Element,
  implementation: Element | undefined,
  utils: IdlUtils,
): implementation is Element {
  if (
    !implementation ||
    utils.wrapperForImpl(implementation) !== probe ||
    typeof implementation.getAttribute !== 'function' ||
    typeof implementation.hasAttribute !== 'function' ||
    implementation.getAttribute('data-nwsapi-probe') !== null ||
    implementation.hasAttribute('data-nwsapi-probe')
  ) {
    return false
  }
  probe.setAttribute('data-nwsapi-probe', '')
  if (
    implementation.getAttribute('data-nwsapi-probe') !== '' ||
    !implementation.hasAttribute('data-nwsapi-probe')
  ) {
    return false
  }
  return true
}

export type IdlUtils = {
  wrapperForImpl(node: unknown): Node
  implForWrapper?(node: Node): Element | undefined
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
  const implementation = unwrap(probe)
  if (!validAttributeReader(probe, implementation, utils)) {
    return undefined
  }
  const readers: HostReaders = {
    attrOf: (node, name) => {
      const impl = unwrap(node)
      return impl ? impl.getAttribute(name) : node.getAttribute(name)
    },
    hasAttrOf: (node, name) => {
      const impl = unwrap(node)
      return impl ? impl.hasAttribute(name) : node.hasAttribute(name)
    },
  }
  const tree = options.domSymbolTree
  if (
    tree &&
    typeof tree.parent === 'function' &&
    typeof tree.nextSibling === 'function' &&
    typeof tree.previousSibling === 'function'
  ) {
    const left = probe.appendChild(document.createElement('i'))
    const right = probe.appendChild(document.createElement('i'))
    const leftImpl = unwrap(left)
    const rightImpl = unwrap(right)
    if (
      !leftImpl ||
      !rightImpl ||
      tree.parent(leftImpl) !== implementation ||
      tree.nextSibling(leftImpl) !== rightImpl ||
      tree.previousSibling(rightImpl) !== leftImpl
    ) {
      return readers
    }
    readers.upOf = node => {
      const impl = unwrap(node)
      if (!impl) {
        return node.parentElement
      }
      const parent = tree.parent(impl)
      return parent && parent.nodeType === 1
        ? (utils.wrapperForImpl(parent) as Element)
        : null
    }
    readers.nextOf = node => {
      let impl: Node | null | undefined = unwrap(node)
      if (!impl) {
        return node.nextElementSibling
      }
      while ((impl = tree.nextSibling(impl))) {
        if (impl.nodeType === 1) {
          return utils.wrapperForImpl(impl) as Element
        }
      }
      return null
    }
    readers.prevOf = node => {
      let impl: Node | null | undefined = unwrap(node)
      if (!impl) {
        return node.previousElementSibling
      }
      while ((impl = tree.previousSibling(impl))) {
        if (impl.nodeType === 1) {
          return utils.wrapperForImpl(impl) as Element
        }
      }
      return null
    }
  }
  return readers
}
