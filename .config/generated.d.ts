// The build creates this CommonJS module before tests run. Keep clean-tree
// type checks independent of the generated JavaScript file.
declare module '*/src/nwsapi.js' {
  // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
  type AdapterConstructor = typeof import('*/src/dom-selector.js').default
  interface Factory {
    (host: {
      document: Document
      DOMException?: typeof DOMException
      Element?: typeof Element
    }): typeof NW.Dom
    readonly DOMSelector: AdapterConstructor
  }
  const factory: Factory
  export default factory
}

declare module '*/src/dom-selector.js' {
  // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
  type QueryCollection = import('./runtime.d.ts').NwsapiCollection
  // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
  type SelectorList = import('css-tree').SelectorList
  export default class DOMSelector {
    constructor(window: unknown, document?: unknown, options?: unknown)
    static configure(window: unknown, options: Record<string, boolean>): void
    static use(window: unknown, engine: typeof NW.Dom): typeof NW.Dom
    engine: typeof NW.Dom
    selectors: Map<string, unknown> | undefined
    matches(
      selector: string,
      node: unknown,
      options?: { noexcept?: boolean },
    ): boolean
    closest(
      selector: string,
      node: unknown,
      options?: { noexcept?: boolean },
    ): Element | null
    querySelector(
      selector: string,
      node: unknown,
      options?: { noexcept?: boolean },
    ): Element | null
    querySelectorAll(
      selector: string,
      node: unknown,
      options?: { noexcept?: boolean },
    ): QueryCollection
    clear(clearAll?: boolean): void
    supports(selector: unknown): boolean
    extractSubjects(): Array<{ id: null; className: null; tag: null }>
    check(
      selector: string,
      node: unknown,
    ): {
      ast: SelectorList | null
      match: boolean
      pseudoElement: null
    }
  }
}
