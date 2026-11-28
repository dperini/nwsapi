import { queryNativeHost } from './native-query.mts'
import type { InstalledQuery } from '../core/dom/install.mts'
import type { NativeRoutePlannerHost } from './native/types.mts'
import type { NativeQueryBinding } from './native/types.mts'
import type { NativeLegacyContext } from './native/types.mts'

type HostPlan = { free(): void }

type WasmSnapshot = {
  set_ids_dupes(enabled: boolean): void
  set_route_planner(enabled: boolean): void
  set_route_planner_host(host: string | undefined): void
  push_node(
    parent: number | undefined,
    tag: string | undefined,
    namespace: string | undefined,
    text: boolean,
    document: boolean,
    shadowRoot: boolean,
  ): boolean
  set_attribute(
    index: number,
    namespace: Uint16Array | undefined,
    name: Uint16Array,
    value: Uint16Array,
  ): boolean
  set_form_property(index: number, checked: boolean, value: boolean): boolean
  set_target(index: number, value: boolean): boolean
  set_custom_element_defined(index: number, value: boolean): boolean
  set_directionality(index: number, direction: string): boolean
  set_has_child(index: number, value: boolean): boolean
  set_has_offset_dimensions(index: number, value: boolean): boolean
  set_host_states(index: number, states: string[]): boolean
  query(
    method: string,
    plan: HostPlan,
    index: number,
    bulkHasPlanner?: NativeQueryBinding['bulkHasPlanner'],
  ): Uint32Array | undefined
  free(): void
}

// Avoid spreading an unbounded selector into String.fromCharCode: engines
// impose an argument-count limit that is much lower than the maximum selector
// length accepted by the JS parser. Chunking also preserves raw UTF-16 units.
function selectorText(selector: Uint16Array): string {
  const chunkSize = 0x4000
  let result = ''
  for (
    let offset = 0, length = selector.length;
    offset < length;
    offset += chunkSize
  ) {
    result += String.fromCharCode(
      ...selector.subarray(offset, offset + chunkSize),
    )
  }
  return result
}

/**
 * Exports of an initialized browser WebAssembly selector module.
 */
export type WasmQueryModule = {
  compile_host_selector(
    selector: Uint16Array,
    jqueryEnabled: boolean,
    forgiving: boolean,
    notEqualOperator: boolean,
    customOperator?: string,
  ): HostPlan | undefined
  compile_host_selector_with_operator_grammar?(
    selector: Uint16Array,
    jqueryEnabled: boolean,
    forgiving: boolean,
    notEqualOperator: boolean,
    customOperator: string | undefined,
    grammar: string,
  ): HostPlan | undefined
  BrowserSnapshot: new (
    xmlDocument: boolean,
    quirksDocument?: boolean,
  ) => WasmSnapshot
}

export function createWasmInstalledQuery(
  wasm: WasmQueryModule,
  document: Document,
  directionality: (element: Element) => 'ltr' | 'rtl',
  selectorStates:
    | ((element: Element, selector?: string) => string[] | undefined)
    | undefined,
  jquerySetting: boolean | (() => boolean),
  notEqualOperator: (selector: string) => boolean,
  forgiving: () => boolean,
  idsDupes: () => boolean,
  routePlanner: () => boolean,
  routePlannerHost: () => NativeRoutePlannerHost | undefined,
  cacheLimit: () => number,
  cacheBytes: () => number,
  customBulkHasPlanner: () => boolean,
  customResolvers: () => boolean,
  usesCustomResolver: (selector: string) => boolean,
  customOperatorForSelector: (selector: string) => string | undefined,
  legacyContext: () => NativeLegacyContext | undefined,
  bulkHasPlanner?: () => NativeQueryBinding['bulkHasPlanner'],
  operatorGrammar?: () => string | undefined,
): InstalledQuery {
  const plans = new Map<string, { plan: HostPlan; bytes: number }>()
  let retainedBytes = 0
  let activeGrammar = operatorGrammar?.()
  let activeLimit = cacheLimit()
  let activeByteLimit = cacheBytes()
  const clearPlans = () => {
    const keys = Array.from(plans.keys())
    for (let index = 0, length = keys.length; index < length; index++) {
      const key = keys[index]!
      plans.get(key)!.plan.free()
    }
    plans.clear()
    retainedBytes = 0
  }

  // eslint-disable-next-line complexity -- this centralizes plan cache policy for the WASM ABI.
  const compilePlan = (
    selector: Uint16Array,
    jquery: boolean,
    forgivingLists: boolean,
    customNotEqual: boolean,
    customOperator: string | undefined,
  ): { plan: HostPlan | undefined; retained: boolean } => {
    const nextLimit = cacheLimit()
    const nextByteLimit = cacheBytes()
    const grammar = operatorGrammar?.()
    if (
      grammar !== activeGrammar ||
      nextLimit !== activeLimit ||
      nextByteLimit !== activeByteLimit
    ) {
      clearPlans()
      activeGrammar = grammar
      activeLimit = nextLimit
      activeByteLimit = nextByteLimit
    }
    const source = selectorText(selector)
    const key = `${jquery ? 1 : 0}:${forgivingLists ? 1 : 0}:${customNotEqual ? 1 : 0}:${customOperator ?? ''}:${source}`
    const cached = plans.get(key)
    if (cached) {
      return { plan: cached.plan, retained: true }
    }
    const plan =
      grammar !== undefined
        ? wasm.compile_host_selector_with_operator_grammar?.(
            selector,
            jquery,
            forgivingLists,
            customNotEqual,
            customOperator,
            grammar,
          )
        : wasm.compile_host_selector(
            selector,
            jquery,
            forgivingLists,
            customNotEqual,
            customOperator,
          )
    const bytes = selector.length * 2 + (customOperator?.length ?? 0) * 2 + 256
    if (
      !plan ||
      selector.length > 4096 ||
      activeLimit === 0 ||
      bytes > activeByteLimit
    ) {
      return { plan, retained: false }
    }
    if (plans.size >= activeLimit || bytes > activeByteLimit - retainedBytes) {
      clearPlans()
    }
    plans.set(key, { plan, bytes })
    retainedBytes += bytes
    return { plan, retained: true }
  }

  const query: InstalledQuery = (method, selector, context) => {
    let plan: HostPlan | undefined
    let retainedPlan = false
    try {
      const jqueryEnabled =
        typeof jquerySetting === 'function' ? jquerySetting() : jquerySetting
      const legacy = legacyContext()
      const planner = bulkHasPlanner?.()
      return queryNativeHost(
        {
          directionality,
          ...(selectorStates ? { selectorStates } : {}),
          ...(legacy
            ? {
                legacyReaders: legacy.readers,
                legacyHtmlDocument: legacy.htmlDocument,
              }
            : {}),
          jquery: jqueryEnabled,
          notEqualOperator,
          forgiving: forgiving(),
          idsDupes: idsDupes(),
          routePlanner: routePlanner(),
          routePlannerHost: routePlannerHost(),
          customBulkHasPlanner: customBulkHasPlanner(),
          ...(planner ? { bulkHasPlanner: planner } : {}),
          customResolvers: customResolvers(),
          usesCustomResolver,
          customOperatorForSelector,
          supportsHostSelector(source) {
            const sourceText = selectorText(source)
            const compiled = compilePlan(
              source,
              jqueryEnabled,
              forgiving(),
              notEqualOperator(sourceText),
              customOperatorForSelector(sourceText),
            )
            plan = compiled.plan
            retainedPlan = compiled.retained
            return plan !== undefined
          },
          // eslint-disable-next-line complexity -- This callback marshals one host snapshot through the WASM ABI.
          queryHost(
            method,
            _source,
            nodes,
            context,
            _jqueryEnabled,
            _forgiving,
            idsDupes,
            routePlanner,
            _cacheLimit,
            _cacheBytes,
            routePlannerHost,
            _notEqualOperator,
            _customOperator,
            _cacheId,
            bulkHasPlanner,
          ) {
            if (!plan) {
              return undefined
            }
            const snapshot = new wasm.BrowserSnapshot(
              nodes[0]?.xmlDocument === true,
              nodes[0]?.quirksDocument === true,
            )
            snapshot.set_ids_dupes(idsDupes !== false)
            snapshot.set_route_planner(routePlanner !== false)
            snapshot.set_route_planner_host(routePlannerHost)
            try {
              for (
                let index = 0, length = nodes.length;
                index < length;
                index++
              ) {
                const row = nodes[index]!
                if (
                  !snapshot.push_node(
                    row.parent,
                    row.tag,
                    row.namespace,
                    row.hasTextChild === true,
                    row.document === true,
                    row.shadowRoot === true,
                  )
                ) {
                  return undefined
                }
                const attrs = row.attrs
                if (attrs) {
                  for (let at = 0, count = attrs.length; at < count; at++) {
                    const attr = attrs[at]!
                    if (
                      !snapshot.set_attribute(
                        index,
                        attr.namespace,
                        attr.name,
                        attr.value,
                      )
                    ) {
                      return undefined
                    }
                  }
                }
                if (
                  row.checked !== undefined &&
                  !snapshot.set_form_property(index, true, row.checked)
                ) {
                  return undefined
                }
                if (
                  row.selected !== undefined &&
                  !snapshot.set_form_property(index, false, row.selected)
                ) {
                  return undefined
                }
                if (
                  row.target !== undefined &&
                  !snapshot.set_target(index, row.target)
                ) {
                  return undefined
                }
                if (
                  row.defined !== undefined &&
                  !snapshot.set_custom_element_defined(index, row.defined)
                ) {
                  return undefined
                }
                if (
                  row.directionRtl !== undefined &&
                  !snapshot.set_directionality(
                    index,
                    row.directionRtl ? 'rtl' : 'ltr',
                  )
                ) {
                  return undefined
                }
                if (
                  row.hasChild !== undefined &&
                  !snapshot.set_has_child(index, row.hasChild)
                ) {
                  return undefined
                }
                if (
                  row.hasOffsetDimensions !== undefined &&
                  !snapshot.set_has_offset_dimensions(
                    index,
                    row.hasOffsetDimensions,
                  )
                ) {
                  return undefined
                }
                if (
                  row.states !== undefined &&
                  !snapshot.set_host_states(index, row.states)
                ) {
                  return undefined
                }
              }
              return snapshot.query(method, plan, context, bulkHasPlanner)
            } finally {
              snapshot.free()
            }
          },
        },
        document,
        method,
        selector,
        context,
      )
    } finally {
      if (plan && !retainedPlan) {
        plan.free()
      }
    }
  }
  query.clearCache = clearPlans
  return query
}
