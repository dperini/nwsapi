export type NwsapiCollection = Element[] | NodeListOf<Element>
export type NwsapiContext = Document | DocumentFragment | Element

export interface NwsapiEngine {
  Config: Record<string, boolean>
  Version: string
  Snapshot: {
    doc: Document
    root: Element
    from: Node
    anchor: Element | null
    match: NwsapiEngine['match']
    has(selectors: string[], anchor: Element): boolean
    matchesNative(
      node: Element,
      selector: string,
      fallback?: boolean,
    ): boolean | undefined
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
  matchLambdas: {
    clear(): void
    get(key: string): unknown
    has?(key: string): boolean
    set(key: string, value: unknown): unknown
    size(): number
  }
  S_BODY: string
  M_BODY: string
  S_TEST: string
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
    callback?: boolean | ((element: Element) => unknown),
  ):
    | ((
        candidates: unknown,
        callback: ((element: Element) => unknown) | null | undefined,
        context: Node | null | undefined,
        results: Element[] | boolean,
      ) => Element[] | boolean)
    | null
  configure(): Record<string, boolean>
  configure(option: string): boolean
  configure(options: Record<string, unknown>, clear?: boolean): boolean
  install(all?: boolean): void
  uninstall(): void
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
  down?(element: Element, expression?: string | number | null): Element | null
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
