import type { HostNode, NativeQueryBinding } from '../native/types.mts'
import { elementChildren, row } from './rows.mts'
import type { HostSnapshot, QueryContext, SnapshotOptions } from './types.mts'

function shadowIncludingParent(
  element: Element,
  options: SnapshotOptions,
): Element | null {
  const parent = options.binding.legacyReaders
    ? options.binding.legacyReaders.upOf(element)
    : element.parentElement
  if (parent) {
    return parent
  }
  const root =
    typeof element.getRootNode === 'function'
      ? element.getRootNode()
      : element.parentNode
  return root?.nodeType === 11 && 'host' in root
    ? (root as ShadowRoot).host
    : null
}

function shadowAncestors(
  host: Element,
  options: SnapshotOptions,
): { ancestors: Element[]; connected: boolean } | undefined {
  const ancestors: Element[] = []
  const visited = new Set<Element>()
  let ancestor: Element | null = host
  let connected = false
  while (ancestor && !visited.has(ancestor)) {
    visited.add(ancestor)
    ancestors.push(ancestor)
    const parent = shadowIncludingParent(ancestor, options)
    if (parent) {
      ancestor = parent
      continue
    }
    const root: Node | undefined =
      typeof ancestor.getRootNode === 'function'
        ? ancestor.getRootNode()
        : undefined
    connected =
      root === options.document || ancestor === options.document.documentElement
    break
  }
  if (
    ancestor &&
    visited.has(ancestor) &&
    ancestors[ancestors.length - 1] !== ancestor
  ) {
    return undefined
  }
  return ancestors.length === 0 ? undefined : { ancestors, connected }
}

function seedShadowRoot(
  options: SnapshotOptions,
  rows: HostNode[],
  nodes: QueryContext[],
  stack: Array<{ node: QueryContext; parent: number | undefined }>,
): boolean {
  const seed = shadowAncestors((options.root as ShadowRoot).host, options)
  if (!seed) {
    return false
  }
  let parent: number | undefined
  if (seed.connected) {
    const documentRow = row(options.document, undefined, options)
    if (!documentRow) {
      return false
    }
    if (options.xmlDocument) {
      documentRow.xmlDocument = true
    }
    rows.push(documentRow)
    nodes.push(options.document)
    parent = 0
  }
  for (let index = seed.ancestors.length - 1; index >= 0; index--) {
    const ancestor = seed.ancestors[index]!
    const ancestorRow = row(ancestor, parent, options)
    if (!ancestorRow) {
      return false
    }
    if (rows.length === 0 && options.xmlDocument) {
      ancestorRow.xmlDocument = true
    }
    parent = nodes.length
    rows.push(ancestorRow)
    nodes.push(ancestor)
  }
  stack.push({ node: options.root, parent })
  return true
}

// eslint-disable-next-line complexity -- Builds the ordered host snapshot while preserving shadow ancestry.
export function collectHostSnapshot(
  options: SnapshotOptions,
): HostSnapshot | undefined {
  const nodes: QueryContext[] = []
  const rows: HostNode[] = []
  const stack: Array<{ node: QueryContext; parent: number | undefined }> = []
  if (options.root.nodeType === 11 && 'host' in options.root) {
    if (!seedShadowRoot(options, rows, nodes, stack)) {
      return undefined
    }
  } else {
    stack.push({ node: options.root, parent: undefined })
  }
  let contextIndex: number | undefined
  while (stack.length > 0) {
    const entry = stack.pop()!
    const data = row(entry.node, entry.parent, options)
    if (!data) {
      return undefined
    }
    const index = nodes.length
    if (entry.node === options.context) {
      contextIndex = index
    }
    if (index === 0 && options.xmlDocument) {
      data.xmlDocument = true
    }
    rows.push(data)
    nodes.push(entry.node)
    if (entry.node.nodeType === 1) {
      const shadowRoot = (entry.node as Element).shadowRoot
      if (shadowRoot) {
        stack.push({ node: shadowRoot, parent: index })
      }
    }
    const children = elementChildren(entry.node)
    for (let child = 0, length = children.length; child < length; child++) {
      stack.push({ node: children[child]!, parent: index })
    }
  }
  if (
    rows[0] &&
    options.document.compatMode === 'BackCompat' &&
    !options.xmlDocument
  ) {
    rows[0].quirksDocument = true
  }
  return contextIndex === undefined ? undefined : { nodes, rows, contextIndex }
}

export function mapHostResults(
  nodes: QueryContext[],
  indexes: Uint32Array | number[],
): Element[] | undefined {
  const result: Element[] = []
  for (let index = 0, length = indexes.length; index < length; index++) {
    const node = nodes[indexes[index]!]
    if (node?.nodeType !== 1) {
      return undefined
    }
    result.push(node as Element)
  }
  return result
}
/**
 * Query a fresh snapshot and return the original host elements.
 */
export function queryRoot(
  context: QueryContext,
  binding: NativeQueryBinding,
): QueryContext | undefined {
  if (typeof context.getRootNode === 'function') {
    return context.getRootNode() as QueryContext
  }
  if (context.nodeType === 9 || context.nodeType === 11) {
    return context
  }
  if (!binding.legacyReaders || context.nodeType !== 1) {
    return undefined
  }
  let element = context as Element
  let parent = binding.legacyReaders.upOf(element)
  while (parent) {
    element = parent
    parent = binding.legacyReaders.upOf(element)
  }
  const parentNode = element.parentNode
  return parentNode?.nodeType === 9 || parentNode?.nodeType === 11
    ? (parentNode as Document | DocumentFragment)
    : element
}
