import type { IdlUtils } from '../jsdom.mts'

export type NativeQueryMethod =
  | 'match'
  | 'closest'
  | 'first'
  | 'select'
  | `traverse:${'up' | 'down' | 'next' | 'previous'}:${string}`

export type NativeRoutePlannerHost = 'chromium' | 'jsdom'

export const NATIVE_LEGACY_READERS = '__nwsapiNativeLegacyReaders__' as const
export const NATIVE_BULK_HAS_PLANNER = '__nwsapiNativeBulkHasPlanner__' as const
export const NATIVE_OPERATOR_GRAMMAR =
  '__nwsapiNativeOperatorGrammar__' as const
export const NATIVE_PLAN_CACHE_ID = '__nwsapiNativePlanCacheId__' as const

export type NativeLegacyReaders = {
  tagOf(element: Element): string
  attrOf(element: Element, name: string): string | null
  attrNamesOf(element: Element): string[]
  upOf(element: Element): Element | null
}

export type NativeLegacyContext = {
  readers: NativeLegacyReaders
  htmlDocument: boolean
}

export type HostNode = {
  parent?: number
  tag?: string
  namespace?: string
  attrs?: Array<{
    name: Uint16Array
    value: Uint16Array
    namespace?: Uint16Array
  }>
  hasTextChild?: boolean
  document?: boolean
  quirksDocument?: boolean
  xmlDocument?: boolean
  shadowRoot?: boolean
  checked?: boolean
  selected?: boolean
  target?: boolean
  defined?: boolean
  directionRtl?: boolean
  hasChild?: boolean
  hasOffsetDimensions?: boolean
  states?: string[]
}

export type NativeQueryBinding = {
  supportsHostOperatorGrammar?(
    selector: Uint16Array,
    grammar: string,
    jquery: boolean,
    forgiving: boolean,
    notEqual: boolean,
    customOperator?: string,
  ): boolean
  wrapHostNode?(
    node: unknown,
    utils: IdlUtils,
    isWrapper: (utils: IdlUtils, node: Node) => boolean,
    wrapperForImpl: (utils: IdlUtils, node: unknown) => Node | undefined,
  ): Node | undefined
  version?(): string
  clearPlanCache?(cacheId?: number): void
  jquery?: boolean
  notEqualOperator?: boolean | ((selector: string) => boolean)
  customOperatorForSelector?(selector: string): string | undefined
  legacyReaders?: NativeLegacyReaders
  legacyHtmlDocument?: boolean
  /**
   * @deprecated Host snapshots always sample the offset values used by jQuery
   *   visibility pseudos.
   */
  layoutMeasurements?: boolean
  forgiving?: boolean
  idsDupes?: boolean
  routePlanner?: boolean
  routePlannerHost?: NativeRoutePlannerHost | undefined
  cacheLimit?: number
  cacheBytes?: number
  HOST_OPERATOR_GRAMMAR?: boolean
  operatorGrammar?: string | undefined
  planCacheId?: number
  customBulkHasPlanner?: boolean
  bulkHasPlanner?(
    anchors: number,
    witnesses: number,
    attributes: number,
    dense: number,
    ratio: number,
  ): boolean
  customResolvers?: boolean
  usesCustomResolver?(selector: string): boolean
  supportsHostSelector(
    selector: Uint16Array,
    jqueryEnabled?: boolean,
    forgiving?: boolean,
    cacheLimit?: number,
    cacheBytes?: number,
    notEqualOperator?: boolean,
    customOperator?: string,
    cacheId?: number,
    grammar?: string,
  ): boolean
  directionality?(element: Element): 'ltr' | 'rtl'
  selectorStates?(element: Element, selector?: string): string[] | undefined
  queryHost(
    method: NativeQueryMethod,
    selector: Uint16Array,
    nodes: HostNode[],
    context: number,
    jqueryEnabled?: boolean,
    forgiving?: boolean,
    idsDupes?: boolean,
    routePlanner?: boolean,
    cacheLimit?: number,
    cacheBytes?: number,
    routePlannerHost?: NativeRoutePlannerHost,
    notEqualOperator?: boolean,
    customOperator?: string,
    cacheId?: number,
    bulkHasPlanner?: NativeQueryBinding['bulkHasPlanner'],
    grammar?: string,
  ): number[] | Uint32Array | null | undefined
}

export type NativeMatcher = (
  element: Element,
  selector: string,
  fallback?: boolean,
) => boolean | undefined

export type HostStateReaders = {
  isModal?(element: Element): boolean | undefined
  isFullscreen?(element: Element): boolean
  isPictureInPicture?(element: Element): boolean | undefined
  isPopoverOpen?(element: Element): boolean | undefined
  isMediaState?(element: HTMLMediaElement, state: string): boolean
  isRadioGroupChecked?(element: Element): boolean
  first?(selector: string, context: Element): Element | null
}
