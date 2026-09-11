import type { LegacyHooks } from './legacy.d.ts'
export type { LegacyHooks }

import type { LegacyHookFactory } from './legacy.d.ts'
export type { LegacyHookFactory }

import type { LegacyReaders } from './legacy.d.ts'
export type { LegacyReaders }

export type EngineContext = (Document | Element | DocumentFragment) &
  Partial<
    Pick<
      Document,
      | 'getElementsByTagName'
      | 'getElementsByTagNameNS'
      | 'getElementsByClassName'
      | 'getElementById'
      | 'defaultView'
    >
  >

export type EngineElement = Element &
  Partial<
    Pick<HTMLInputElement, 'disabled' | 'required' | 'type' | 'tabIndex'>
  > & {
    webkitPresentationMode?: string
    contentDocument?: Document | null
    href?: string
    style?: CSSStyleDeclaration
    open?: boolean
  }

import type { HostReaders } from '../adapter/host.d.ts'
export type { HostReaders }

export type EngineGlobal = typeof globalThis & {
  NW?: { Dom?: unknown }
  hostReaders?: HostReaders
}

export type ElementCallback = ((element: Element) => unknown) | null | undefined

export interface NativeMatcherRecord {
  fallback: Element['matches'] | null | undefined
  matcher: Element['matches'] | null | false | undefined
  delegates: boolean
}

export interface ForeignTypeState {
  observer: MutationObserver | null
  foreign: boolean
  dirty: boolean
}

export interface CollectionState<Value> {
  copies: WeakMap<object, Value>
  observer: MutationObserver | null
}

export interface CollectionSnapshotState extends CollectionState<Element[]> {
  document: WeakRef<Document>
}

export interface PrefixSnapshot {
  nodes: Element[]
  classes: PlanCache<Element[]>
}

export interface CompiledResolver {
  filtered?: boolean
  (
    candidate: Element,
    callback: ElementCallback,
    context: EngineContext | null,
    result: false,
    filtered?: Record<string, FilteredNthState>,
  ): boolean
  (
    candidates: ArrayLike<Element>,
    callback: ElementCallback,
    context: EngineContext | null,
    result?: Element[],
  ): Element[]
}

export interface QueryPlan {
  factory: Array<CompiledResolver | null>
  nodeset: string[]
}

export interface RelativePlan extends QueryPlan {
  sibling: boolean
  subtree: number
}

export interface FilteredSiblings {
  nodes: Element[]
  positions: WeakMap<Element, number> | undefined
}

export interface FilteredNthState {
  parents?: WeakMap<Node, FilteredSiblings> | undefined
  parent?: Node
  siblings?: FilteredSiblings
}

export interface SelectorExtension {
  Expression: RegExp
  Callback(
    match: RegExpMatchArray,
    source: string,
    mode: boolean | null,
    callback: boolean | ElementCallback,
  ): {
    source: string
    status: boolean
    match: RegExpMatchArray
    modvar?: string
  }
}

export interface PlanCache<Value> {
  clear(): void
  get(key: string): Value | undefined
  set(key: string, value: Value): Value
  size(): number
}

export interface CompilerAncestry {
  classes?: string[]
  reuse?: string
  required: string[]
  pending: string[]
  walk: boolean
}

export interface IdentifierSyntax {
  optimizer: RegExp
  validator: RegExp
  simpleId: RegExp
  id: RegExp
  tagName: RegExp
  className: RegExp
  attribute: RegExp
}

export interface DirectionHelpers {
  directionality(element: Element): 'ltr' | 'rtl'
}

export interface AttributeOperator {
  p1: string
  p2: string
  p3: string
}

export interface Primordials {
  MapCtor: MapConstructor | undefined
  WeakMapCtor: WeakMapConstructor | undefined
  WeakRefCtor: WeakRefConstructor | undefined
  FinalizationRegistryCtor: FinalizationRegistryConstructor | undefined
  SymbolIterator: typeof Symbol.iterator | undefined
  StringPrototypeIncludes: LegacyReaders['includes'] | undefined
  StringFromCharCode: typeof String.fromCharCode
  StringFromCodePoint: typeof String.fromCodePoint | undefined
  ObjectCreate: typeof Object.create
  ObjectDefineProperty: typeof Object.defineProperty
  ObjectDefineProperties: typeof Object.defineProperties
  ObjectPrototypeHasOwnProperty(value: object, name: PropertyKey): boolean
  ArrayPrototypeSlice(nodes: ArrayLike<Element>): Element[]
}
