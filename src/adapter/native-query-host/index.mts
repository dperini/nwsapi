import type { NativeQueryBinding, NativeQueryMethod } from '../native/types.mts'
import { collectHostSnapshot, mapHostResults } from './snapshot.mts'
import type { QueryContext, SnapshotOptions } from './types.mts'
import {
  canBridgeBulkHasPlanner,
  prepareHostQuery,
  requiresSelectorStates,
} from './support.mts'

export function queryNativeHost(
  binding: NativeQueryBinding,
  document: Document,
  method: NativeQueryMethod,
  selector: string,
  context: QueryContext,
): Element[] | undefined {
  const prepared = prepareHostQuery(binding, document, selector, context)
  if (!prepared) {
    return undefined
  }
  const root = prepared.root
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) {
    return undefined
  }
  const targetHash =
    root === document ? document.defaultView?.location.hash : undefined
  const options: SnapshotOptions = {
    document,
    context,
    root,
    xmlDocument: prepared.xmlDocument,
    targetId: targetHash ? targetHash.slice(1) : undefined,
    registry: document.defaultView?.customElements,
    binding,
    selector,
    selectorStatesRequired: requiresSelectorStates(selector),
  }
  const snapshot = collectHostSnapshot(options)
  if (!snapshot) {
    return undefined
  }
  const indexes = binding.queryHost(
    method,
    prepared.source,
    snapshot.rows,
    snapshot.contextIndex,
    prepared.jqueryEnabled,
    prepared.forgiving,
    binding.idsDupes,
    binding.routePlanner,
    binding.cacheLimit,
    binding.cacheBytes,
    binding.routePlannerHost,
    prepared.notEqualOperator,
    prepared.customOperator,
    binding.planCacheId,
    canBridgeBulkHasPlanner(binding, document, context, selector)
      ? binding.bulkHasPlanner
      : undefined,
    binding.operatorGrammar,
  )
  return indexes ? mapHostResults(snapshot.nodes, indexes) : undefined
}
export function queryNativeTraversal(
  binding: NativeQueryBinding,
  document: Document,
  direction: 'up' | 'down' | 'next' | 'previous',
  expression: string | number | null | undefined,
  context: Node,
): Element | null | undefined {
  const resolved = resolveTraversalExpression(direction, expression)
  if (resolved === null) {
    return null
  }
  if (
    context.nodeType !== 1 &&
    context.nodeType !== 9 &&
    !(direction === 'down' && context.nodeType === 11)
  ) {
    return undefined
  }
  if (direction === 'down' && expression === 0 && context.nodeType !== 1) {
    return context as Element
  }
  const result = queryNativeHost(
    binding,
    document,
    `traverse:${direction}:${resolved.mode}`,
    resolved.selector,
    context as Document | Element,
  )
  return result === undefined ? undefined : (result[0] ?? null)
}

function resolveTraversalExpression(
  direction: 'up' | 'down' | 'next' | 'previous',
  expression: string | number | null | undefined,
): { mode: string; selector: string } | null {
  if (direction === 'down' && expression == null) {
    return { mode: 'none', selector: '*' }
  }
  if (typeof expression === 'number') {
    if (!Number.isSafeInteger(expression) || expression < 0) {
      return null
    }
    return { mode: `index:${expression}`, selector: '*' }
  }
  return typeof expression === 'string'
    ? { mode: 'selector', selector: expression }
    : { mode: 'index:0', selector: '*' }
}
