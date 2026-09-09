export interface LegacyCache<Value> {
  clear(): void
  get(key: string): Value | undefined
  has?(key: string): boolean
  set(key: string, value: Value): Value
  size(): number
}

export interface LegacyContext {
  MapCtor: MapConstructor | undefined
  WeakMapCtor: WeakMapConstructor | undefined
  StringPrototypeIncludes: LegacyReaders['includes'] | undefined
  isHTML(): boolean
  isQuirks(): boolean
  byTag(
    tag: string,
    context: Document | Element | DocumentFragment,
  ): ArrayLike<Element>
}

export interface LegacyReaders {
  includes(this: void, value: string, search: string): boolean
  attrOf(element: Element, name: string): string | null
  hasAttrOf(element: Element, name: string): boolean
  tagOf(element: Element): string
  idOf(element: Element): string
  legacyClassOf(element: Element): string
  upOf(element: Element): Element | null
  nextOf(element: Element): Element | null
  prevOf(element: Element): Element | null
  firstOf(node: ParentNode): Element | null
  attrNamesOf(element: Element): string[]
  connectedOf(node: Node): boolean
}

export interface LegacyHooks extends LegacyReaders {
  hasMap: boolean
  detect(document: Document): boolean
  initialize(document: Document): void
  createCache<Value>(limit?: number): LegacyCache<Value>
  createWeakMap<Key extends WeakKey, Value>(): WeakMap<Key, Value> | undefined
  byIdRaw(id: string, context: ParentNode, from?: Element): Element[]
  byTag(tag: string, context: ParentNode): Element[]
  byClass(name: string, context: ParentNode): Element[]
  siblings(
    start: Element | null,
    target: Element,
    localName?: string,
    namespace?: string | null,
  ): { nodes: Element[]; index: number }
  matcher(
    prototype: Element | null | undefined,
  ): Element['matches'] | null | undefined
  read: {
    tag(variable: string): string
    id(variable: string): string
    cls(variable: string): string
    up(variable: string): string
    next(variable: string): string
    prev(variable: string): string
    attr(variable: string, name: string): string
    has(variable: string, name: string): string
  }
  compile(source: string): { source: string; variables: string }
  installFrames(
    document: Document,
    create: (window: Window & typeof globalThis) => typeof NW.Dom,
  ): void
}

export type LegacyHookFactory = (context: LegacyContext) => LegacyHooks
