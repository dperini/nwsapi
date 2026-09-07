// The build creates this CommonJS module before tests run. Keep clean-tree
// type checks independent of the generated JavaScript file.
declare module '*/src/nwsapi.js' {
  const factory: (host: { document: Document }) => typeof NW.Dom
  export default factory
}

declare module '*/src/dom-selector.js' {
  export default class DOMSelector {
    constructor(window: unknown, document?: unknown, options?: unknown)
    static configure(window: unknown, options: Record<string, boolean>): void
    static use(window: unknown, engine: unknown): unknown
    engine: unknown
    selectors: Map<string, unknown>
    matches(
      selector: string,
      node: unknown,
      options?: { noexcept?: boolean },
    ): boolean
    closest(selector: string, node: unknown): unknown
    querySelector(selector: string, node: unknown): unknown
    querySelectorAll(selector: string, node: unknown): unknown[]
    clear(clearAll?: boolean): void
  }
}
