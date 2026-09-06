export interface NwsapiEngine {
  S_BODY: string
  M_BODY: string
  S_TEST: string
  M_TEST: string
  select(this: void, selector: string, context?: Node): Element[]
  first(selector: string, context?: Node): Element | null
  match(this: void, selector: string, context: Element): boolean
  configure(options: Record<string, unknown>, clear?: boolean): unknown
  install(all?: boolean): void
  uninstall(): void
  registerSelector(
    name: string,
    expression: RegExp,
    callback: (
      match: RegExpMatchArray,
      source: string,
      mode: boolean,
      callback?: unknown,
    ) => unknown,
  ): void
  up?(element: Element, expression?: string | number): Element | null
  down?(element: Element, expression?: string | number): Element | null
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
