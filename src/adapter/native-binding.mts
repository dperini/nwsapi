import {
  hasNativeJqueryResolvers,
  hasUnmarkedSelectorResolvers,
  nativeCustomOperatorForSelector,
  hostSelectorStates,
  selectorUsesCustomResolver,
  selectorUsesNativeNotEqualOperator,
} from './native-query.mts'
import type { NativeQueryBinding } from './native-query.mts'
import { queryNativeHost } from './native-query.mts'
import {
  NATIVE_BULK_HAS_PLANNER,
  NATIVE_LEGACY_READERS,
  NATIVE_PLAN_CACHE_ID,
  NATIVE_OPERATOR_GRAMMAR,
} from './native/types.mts'
import type { NativeLegacyContext } from './native/types.mts'
import type { NwsapiEngine } from '../../.config/runtime.d.ts'
import type { NativeRoutePlannerHost } from './native/types.mts'

type NativeBindingEngine = NwsapiEngine & {
  Snapshot: {
    doc: Document
    isFocusable: NwsapiEngine['Snapshot']['isFocusable']
    matchesNative: NwsapiEngine['Snapshot']['matchesNative']
  }
  Selectors: Record<string, { Expression: RegExp }>
  Operators: Record<string, unknown>
  Combinators: Record<string, (match: RegExpMatchArray) => string>
  CFG: { operators: string; combinators: string }
  [NATIVE_LEGACY_READERS]?: NativeLegacyContext | undefined
  [NATIVE_PLAN_CACHE_ID]?: number | undefined
  customBulkHasPlanner: boolean
  [NATIVE_BULK_HAS_PLANNER]?: NativeQueryBinding['bulkHasPlanner']
  hasPluginPlans: boolean
  [NATIVE_OPERATOR_GRAMMAR]?: string
  customSyntax: boolean
  customResolvers: boolean
  routePlannerHost?: NativeRoutePlannerHost | undefined
  directionality(element: Element): 'ltr' | 'rtl'
}

export type QueryMethod = 'match' | 'closest' | 'first' | 'select'
type QueryResult = boolean | Element | Element[] | null

// Separate CommonJS copies can share the same native addon's thread-local cache.
const cacheSequence = Symbol.for('nwsapi.DOMSelector.planCacheSequence.v1')
const cacheOwner = globalThis as typeof globalThis & {
  [cacheSequence]?: number
}

function planCacheId(engine: NativeBindingEngine): number {
  const existing = engine[NATIVE_PLAN_CACHE_ID]
  if (existing !== undefined) {
    return existing
  }
  const nextPlanCacheId = cacheOwner[cacheSequence] ?? 1
  if (nextPlanCacheId > 0xffff_ffff) {
    throw new RangeError('Native selector plan cache IDs exhausted')
  }
  const cacheId = nextPlanCacheId
  cacheOwner[cacheSequence] = cacheId + 1
  Object.defineProperty(engine, NATIVE_PLAN_CACHE_ID, { value: cacheId })
  return cacheId
}

export function nativeBinding(
  engine: NativeBindingEngine,
  binding: NativeQueryBinding,
): NativeQueryBinding {
  const legacyContext = engine[NATIVE_LEGACY_READERS]
  const cacheId = planCacheId(engine)
  const grammar = binding.HOST_OPERATOR_GRAMMAR
    ? engine[NATIVE_OPERATOR_GRAMMAR]
    : undefined
  const unsupportedSyntax = engine.customSyntax && grammar === undefined
  const config = engine.configure()
  return {
    ...binding,
    planCacheId: cacheId,
    operatorGrammar: grammar,
    forgiving: config['FORGIVING'] === true,
    idsDupes: config['IDS_DUPES'] === true,
    routePlanner: config['ROUTE_PLANNER'] === true,
    routePlannerHost: engine.routePlannerHost,
    cacheLimit: config['CACHE_LIMIT'],
    cacheBytes: config['CACHE_BYTES'],
    customBulkHasPlanner: engine.customBulkHasPlanner,
    ...(engine[NATIVE_BULK_HAS_PLANNER]
      ? {
          bulkHasPlanner: (
            anchors: number,
            witnesses: number,
            attributes: number,
            dense: number,
            ratio: number,
          ) => {
            try {
              return (
                engine[NATIVE_BULK_HAS_PLANNER]!(
                  anchors,
                  witnesses,
                  attributes,
                  dense,
                  ratio,
                ) === true
              )
            } catch {
              return false
            }
          },
        }
      : {}),
    customResolvers:
      engine.hasPluginPlans ||
      unsupportedSyntax ||
      engine.customResolvers ||
      hasUnmarkedSelectorResolvers(engine),
    usesCustomResolver: selector =>
      engine.hasPluginPlans ||
      unsupportedSyntax ||
      selectorUsesCustomResolver(engine, selector),
    customOperatorForSelector: selector =>
      nativeCustomOperatorForSelector(engine, selector),
    jquery: binding.jquery === true || hasNativeJqueryResolvers(engine),
    notEqualOperator: selector =>
      selectorUsesNativeNotEqualOperator(engine, selector),
    ...(engine.Config.LEGACY && legacyContext
      ? {
          legacyReaders: legacyContext.readers,
          legacyHtmlDocument: legacyContext.htmlDocument,
        }
      : {}),
    directionality:
      binding.directionality || (element => engine.directionality(element)),
    ...(binding.selectorStates
      ? { selectorStates: binding.selectorStates }
      : engine.Config.LEGACY
        ? {}
        : {
            selectorStates: (element: Element, selector?: string) =>
              hostSelectorStates(
                engine.Snapshot.doc,
                engine.Snapshot.isFocusable,
                engine.Snapshot.matchesNative,
                element,
                engine.Snapshot,
                selector,
              ),
          }),
  }
}

export function queryNativeAdapter(
  engine: NativeBindingEngine,
  binding: NativeQueryBinding,
  document: Document,
  method: QueryMethod,
  selector: string,
  node: Document | DocumentFragment | Element,
): QueryResult | undefined {
  const result = queryNativeHost(
    nativeBinding(engine, binding),
    document,
    method,
    selector,
    node,
  )
  if (result === undefined) {
    return undefined
  }
  if (method === 'match') {
    return result.length !== 0
  }
  if (method === 'select') {
    return result
  }
  return result[0] ?? null
}
