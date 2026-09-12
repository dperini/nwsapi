import type {
  LegacyHooks,
  LegacyHookFactory,
  LegacyReaders,
  EngineContext,
  EngineElement,
  HostReaders,
  EngineGlobal,
  ElementCallback,
  NativeMatcherRecord,
  ForeignTypeState,
  CollectionState,
  CollectionSnapshotState,
  PrefixSnapshot,
  CompiledResolver,
  QueryPlan,
  RelativePlan,
  FilteredSiblings,
  FilteredNthState,
  SelectorExtension,
  PlanCache,
  CompilerAncestry,
  IdentifierSyntax,
  DirectionHelpers,
  AttributeOperator,
  Primordials,
} from '../types.mts'
export interface RuntimeState {
  global: EngineGlobal
  Factory: (global: EngineGlobal) => unknown
  version: string
  primordials: Primordials
  hostReaders: HostReaders | undefined
  doc: Document
  root: HTMLElement
  ELEMENT_PROTO: Element
  sliceCall: (nodes: ArrayLike<Element>) => Element[]
  CFG: { operators: string; combinators: string }
  REX: {
    HasEscapes: RegExp
    HexNumbers: RegExp
    EscOrQuote: RegExp
    RegExpChar: RegExp
    TrimSpaces: RegExp
    SplitGroup: RegExp
    CommaGroup: RegExp
    FixEscapes: RegExp
    CombineWSP: RegExp
    TabCharWSP: RegExp
    LogicalPfx: RegExp
  }
  STD: { apimethods: RegExp }
  Patterns: Record<string, RegExp> & {
    id?: RegExp
    tagName?: RegExp
    className?: RegExp
    attribute?: RegExp
  }
  reLinkName: RegExp
  qsNotArgs: string
  qsInvalid: string
  reNthElem: RegExp
  reNthType: RegExp
  reOptimizer: RegExp
  reSimpleId: RegExp
  reValidator: RegExp
  Config: {
    [key: string]: boolean
    IDS_DUPES: boolean
    FORGIVING: boolean
    LEGACY: boolean
    NODE_LIST: boolean
    LOGERRORS: boolean
    USR_EVENT: boolean
    VERBOSITY: boolean
  }
  legacyHooks: LegacyHooks | undefined
  createWeakMap: <Key extends WeakKey, Value>() =>
    | WeakMap<Key, Value>
    | undefined
  NAMESPACE: string | null
  QUIRKS_MODE: boolean
  HTML_DOCUMENT: boolean
  ATTR_STD_OPS: Record<string, number>
  HTML_TABLE: Record<string, number>
  Combinators: Record<string, (match: RegExpMatchArray) => string>
  Selectors: Record<string, SelectorExtension>
  Operators: Record<string, AttributeOperator>
  concatCall: (
    nodes: ArrayLike<Element>,
    callback: (element: Element) => unknown,
  ) => Element[]
  concatList: (list: Element[], nodes: ArrayLike<Element>) => Element[]
  CACHE_LIMIT: number
  createCache: <Value>(limit?: number) => PlanCache<Value>
  toNodeList: (
    nodeArray: Element[] | NodeListOf<Element>,
  ) => Element[] | NodeListOf<Element>
  isInstanceOf: (nodes: unknown) => nodes is NodeListOf<Element>
  documentOrder: (a: Element, b: Element) => 0 | 1 | -1
  mergeResults: (nodes: Element[], ends: number[]) => Element[]
  hasDupes: boolean
  unique: (nodes: Element[]) => Element[]
  switchContext: (
    context: EngineContext,
    force?: boolean | undefined,
  ) => EngineContext
  codePointToUTF16: (codePoint: number) => string
  stringFromCodePoint: (codePoint: number) => string
  escapeIdentifier: (str: string) => string
  unescapeIdentifier: (str: string) => string
  splitList: (text: string) => string[]
  matchLogical: (
    selector: string,
    prefix?: RegExp,
  ) => [string, string, string, string] | null
  matchNth: (selector: string) => RegExpMatchArray | null
  normalizeCombinators: (text: string) => string
  method: {
    readonly '#': 'getElementById'
    readonly '*': 'getElementsByTagName'
    readonly '|': 'getElementsByTagNameNS'
    readonly '.': 'getElementsByClassName'
  }
  fetch: Record<
    string,
    (name: string, context: EngineContext) => Element[] | NodeListOf<Element>
  >
  byIdRaw: (id: string, context: EngineContext, from?: Element) => Element[]
  byId: (id: string, context: EngineContext) => Element[]
  byTagNS: (context: EngineContext, tag: string) => Element[]
  typeRoutes: PlanCache<{ broad: boolean; remaining: number }>
  byTags: (
    names: string,
    context: EngineContext,
  ) => Element[] | NodeListOf<Element>
  collectionRoots: WeakMap<Node, CollectionSnapshotState> | null | undefined
  collectionStates: WeakMap<object, CollectionSnapshotState> | null | undefined
  collectionSnapshot: (
    nodes: ArrayLike<Element>,
    context: EngineContext,
    length?: number | undefined,
    small?: boolean | undefined,
    identity?: object | undefined,
  ) => ArrayLike<Element>
  collectionCopy: (
    nodes: ArrayLike<Element>,
    context: EngineContext,
    snapshot?: ArrayLike<Element>,
    identity?: object | undefined,
  ) => Element[]
  asciiLower: (name: string) => string
  matchesTag: (element: Element, name: string) => boolean
  foreignTypeRoots: WeakMap<Node, ForeignTypeState> | null | undefined
  hasForeignTypes: (context: EngineContext) => boolean
  byTag: (
    tag: string,
    context: EngineContext,
  ) => Element[] | NodeListOf<Element>
  byClass: (
    cls: string,
    context: EngineContext,
  ) => Element[] | NodeListOf<Element>
  attributeValueNS: (e: Element, name: string) => string | null
  hasAttributeNS: (
    e: Element,
    name: string,
    pattern?: RegExp,
    expected?: boolean,
  ) => boolean
  includes: (this: void, value: string, search: string) => boolean
  attrOf: (element: Element, name: string) => string | null
  hasAttrOf: (element: Element, name: string) => boolean
  tagOf: (element: Element) => string
  idOf: (element: Element) => string
  upOf: (element: Element) => Element | null
  nextOf: (element: Element) => Element | null
  _prevOf: (element: Element) => Element | null
  firstOf: (node: ParentNode) => Element | null
  attrNamesOf: (element: Element) => string[]
  connectedOf: (node: Node) => boolean
  modernReaders: LegacyReaders
  useLegacy: (on: boolean) => void
  classOf: (e: Element) => string
  readDirect: {
    tag: (v: string) => string
    id: (v: string) => string
    cls: (v: string) => string
    up: (v: string) => string
    next: (v: string) => string
    prev: (v: string) => string
    attr: (v: string, name: string) => string
    has: (v: string, name: string) => string
  }
  readGuarded: {
    tag: (v: string) => string
    id: (v: string) => string
    cls: (v: string) => string
    up: (v: string) => string
    next: (v: string) => string
    prev: (v: string) => string
    attr: (v: string, name: string) => string
    has: (v: string, name: string) => string
  }
}
