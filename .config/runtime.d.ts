import type { WasmQueryModule } from '../src/adapter/wasm-query.mts'
import type { InstalledQuery } from '../src/core/dom/install.mts'
import type {
  EngineConfiguration,
  Configure,
} from '../src/core/initialize/configuration.mts'
import type { RoutePlannerHost } from '../src/core/select/has/policy.mts'
import type { BulkHasPlanner } from '../src/core/state/types.mts'
import type { LegacyHookFactory } from '../src/core/state/legacy.mts'
export type NwsapiCollection = Element[] | NodeListOf<Element>
export type NwsapiContext = Document | DocumentFragment | Element

export interface NwsapiEngine {
  Config: EngineConfiguration
  Selectors: Record<
    string,
    {
      Expression: RegExp
      Callback: Parameters<NwsapiEngine['registerSelector']>[2]
    }
  >
  Combinators: Record<string, (match: RegExpMatchArray) => string>
  Operators: Record<string, unknown>
  directionality(element: Element): 'ltr' | 'rtl'
  nativeTraversal?(
    direction: 'up' | 'down' | 'next' | 'previous',
    expression: string | number | null | undefined,
    node: Node,
  ): Element | null | undefined
  useRoutePlanner(host: RoutePlannerHost | null): void
  readonly routePlannerHost: RoutePlannerHost | undefined
  registerBulkHasPlanner(planner: BulkHasPlanner | null): void
  Version: string
  Snapshot: {
    doc: Document
    root: Element
    from: Node
    anchor: Element | null
    includes(this: void, value: string, search: string): boolean
    match: NwsapiEngine['match']
    has(selectors: string | string[], anchor: Element): boolean
    matchesNative(
      node: Element,
      selector: string,
      fallback?: boolean,
    ): boolean | undefined
    isFocusable(element: Element): Element | false
    isModal(element: Element): boolean | undefined
    isFullscreen(element: Element): boolean
    isPictureInPicture(element: Element): boolean | undefined
    isPopoverOpen(element: Element): boolean | undefined
    isMediaState(media: HTMLMediaElement, state: string): boolean
    isRadioGroupChecked(element: Element): boolean
    mayMatch(
      this: void,
      node: Element,
      mask: number,
      state: { seen: number; kept: number; rest: number },
    ): boolean
    clearAncestorMasks(): void
  }
  byId(id: string, context: NwsapiContext): Element[]
  byTag(tag: string, context: NwsapiContext): NwsapiCollection
  byClass(name: string, context: NwsapiContext): NwsapiCollection
  closest(
    selector: string,
    context: Element,
    callback?: (element: Element) => unknown,
  ): Element | null
  registerCombinator(
    name: string,
    resolver: (match: RegExpMatchArray) => string,
  ): void
  matchResolvers: NwsapiEngine['matchLambdas']
  matchLambdas: {
    clear(): void
    get(key: string): unknown
    has?(key: string): boolean
    set(key: string, value: unknown): unknown
    size(): number
    bytes?(): number
  }
  S_BODY: string
  N_BODY: string
  M_BODY: string
  S_TEST: string
  N_TEST: string
  M_TEST: string
  select(
    this: void,
    selector: string,
    context?: Node,
    callback?: (element: Element) => unknown,
  ): NwsapiCollection
  first(
    this: void,
    selector: string,
    context?: Node,
    callback?: (element: Element) => unknown,
  ): Element | null
  match(
    this: void,
    selector: string,
    context: Element,
    callback?: (element: Element) => unknown,
  ): boolean
  compile(
    selector: string,
    mode: boolean | null,
    callback?: boolean | null | ((element: Element) => unknown),
  ):
    | ((
        candidates: unknown,
        callback: ((element: Element) => unknown) | null | undefined,
        context: Node | null | undefined,
        results: Element[] | boolean,
      ) => Element[] | boolean)
    | null
  configure: Configure
  createWasmInstalledQuery(wasm: WasmQueryModule): InstalledQuery
  install(all?: boolean, backend?: InstalledQuery): void
  uninstall(): void
  registerLegacyHooks(factory: LegacyHookFactory): boolean
  registerOperator(
    name: string,
    resolver: { p1: string; p2: string; p3: string },
  ): unknown
  registerSelector(
    name: string,
    expression: RegExp,
    callback: (
      match: RegExpMatchArray,
      source: string,
      mode: boolean | null,
      callback?: unknown,
    ) => unknown,
  ): void
  up?(element: Element, expression?: string | number): Element | null
  down?(
    element: Node | null,
    expression?: string | number | null,
  ): Element | null
  next?(element: Element, expression?: string | number): Element | null
  previous?(element: Element, expression?: string | number): Element | null
}
declare global {
  const NW: { Dom: NwsapiEngine }
  interface Window {
    NW: typeof NW
  }
  const define: { (factory: unknown): void; amd?: unknown }
}
