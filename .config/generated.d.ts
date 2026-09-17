// The build creates this CommonJS module before tests run. Keep clean-tree
// type checks independent of the generated JavaScript file.
declare module '*/dist/nwsapi.js' {
  // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
  type Adapter = typeof import('*/dist/adapter/dom-selector.js').default
  // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
  type HostReaders = import('../src/adapter/jsdom.mts').HostReaders
  interface Factory {
    (host: {
      document: Document
      DOMException?: typeof DOMException
      Element?: typeof Element
      hostReaders?: HostReaders
    }): typeof NW.Dom
    readonly DOMSelector: Adapter
  }
  const factory: Factory
  export default factory
}

declare module '*/dist/adapter/dom-selector.js' {
  // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
  type SelectorList = import('css-tree').SelectorList
  export default class DOMSelector {
    constructor(window: unknown, document?: unknown, options?: unknown)
    static configure(window: unknown, options: Record<string, boolean>): void
    static use(window: unknown, engine: typeof NW.Dom): typeof NW.Dom
    engine: typeof NW.Dom
    // oxlint-disable-next-line typescript/consistent-type-imports -- Keep this wildcard declaration ambient.
    css: typeof import('css-tree') | undefined
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
    ): Element[]
    clear(clearAll?: boolean): void
    supports(selector: unknown): boolean
    extractSubjects(selector?: string): Array<{
      id: string | null
      className: string | null
      tag: string | null
    }>
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

// The optional module registers hooks on an existing engine.
declare module '*/dist/modules/nwsapi-legacy.js' {
  export default function registerLegacy<Engine extends typeof NW.Dom>(
    engine: Engine,
  ): Engine
}
