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
export interface QueryState {
  nthElement: (element: Element | null, dir: number) => number
  nthFiltered: (
    element: Element,
    selector: string,
    reverse: boolean,
    state: FilteredNthState | null,
  ) => number
  nthOfType: (element: Element | null, dir: number, stable?: boolean) => number
  ancestorMasks: WeakMap<Element, number> | null | undefined
  lastMaskNode: Element | null
  lastMaskValue: number
  tagBits: Record<string, number>
  tagBit: (name: string) => number
  ancestorMask: (node: EngineElement) => number
  FILTER_SAMPLE: number
  FILTER_KEEP: number
  FILTER_RETRY: number
  mayMatch: (
    node: EngineElement,
    mask: number,
    state: { rest: number; kept: number; seen: number },
  ) => boolean
  clearAncestorMasks: () => boolean
  isHTML: (node: Node) => boolean
  isDefined: (element: EngineElement) => boolean
  isRequired: (node: EngineElement) => boolean
  isContentEditable: (node: EngineElement) => boolean
  isDisabled: (element: EngineElement) => boolean
  isFocusable: (node: EngineElement) => false | EngineElement
  matchesNative: (
    node: EngineElement,
    selector: string,
    unavailable?: boolean | undefined,
  ) => boolean | undefined
  matchingNative: { delegates: boolean } | null
  matcherDoc: Document | null
  matcherRecord: NativeMatcherRecord | null | undefined
  matcherCache: WeakMap<Document, NativeMatcherRecord> | null | undefined
  isOpen: (node: EngineElement) => boolean | undefined
  isClosed: (node: EngineElement) => boolean | undefined
  fullscreenState: (node: EngineElement) => boolean | undefined
  isFullscreen: (node: EngineElement) => boolean
  isModal: (node: EngineElement) => boolean | undefined
  isPictureInPicture: (node: EngineElement) => boolean | undefined
  isPopoverOpen: (node: EngineElement) => boolean | undefined
  isLink: (node: EngineElement) => boolean
  isMediaState: (media: HTMLMediaElement, state: string) => boolean
  configure: (
    option: string | Record<string, unknown>,
    clear?: boolean,
  ) =>
    | boolean
    | {
        [key: string]: boolean
        IDS_DUPES: boolean
        FORGIVING: boolean
        LEGACY: boolean
        NODE_LIST: boolean
        LOGERRORS: boolean
        USR_EVENT: boolean
        VERBOSITY: boolean
      }
  errors: number
  emit: (message: string, proto?: TypeErrorConstructor | undefined) => void
  initialize: (doc: Document) => void
  setIdentifierSyntax: () => void
  compilePrefixes: string[]
  F_INIT: string
  S_HEAD: string
  M_HEAD: string
  N_HEAD: string
  S_LOOP: string
  M_LOOP: string
  N_LOOP: string
  S_BODY: string
  M_BODY: string
  N_BODY: string
  S_TAIL: string
  M_TAIL: string
  N_TAIL: string
  S_TEST: string
  M_TEST: string
  N_TEST: string
  S_VARS: string[]
  M_VARS: string[]
  N_VARS: string[]
  canReuseAncestor: (selector: string) => boolean
  compile: (
    selector: string,
    mode: boolean | null,
    callback: boolean | ElementCallback,
    relative?: boolean,
    existenceOnly?: boolean,
  ) => CompiledResolver | null
  isCompound: (text: string, siblings?: boolean) => boolean
  validateLogical: (argument: string, relative: boolean) => boolean
  prepareHas: (text: string) => string | null
  readPseudo: (
    text: string,
  ) =>
    | { name: string; double: boolean; argument: string; rest: string }
    | { name: string; double: boolean; argument: null; rest: string }
    | null
  isIdent: (text: string, custom?: boolean) => boolean
  hasPseudoElement: (text: string) => boolean
  treePseudo: (name: string) => boolean
  validPseudoElement: (name: string, argument: string | null) => boolean
  isPseudoExtension: (text: string) => boolean
  validPseudoStates: (text: string, context: string) => boolean
  validPseudoTail: (text: string) => boolean
  validPseudoSyntax: (text: string) => boolean
  hasHost: (text: string) => boolean
  prepareCompound: (text: string) => string | null
  shadowRootOf: (scope: Node) => ShadowRoot | null
  shadowParent: (element: Element, scope: Node) => Element | null
  isHost: (
    element: Element,
    argument: string | null,
    contextual: boolean,
    scope: Node,
  ) => boolean
  hasSlotted: (element: Element, argument: string | null) => boolean
  directionality: (element: Element) => 'ltr' | 'rtl'
  isDirection: (element: Element, direction: string) => boolean
  isLanguage: (element: Element, range: string) => boolean
  validBlocks: (text: string) => boolean
  notFlag: number
  compileSelector: (
    expression: string,
    source: string,
    mode: boolean | null,
    callback: boolean | ElementCallback,
    ancestry?: CompilerAncestry,
  ) => string
  ancestor: (
    selectors: string,
    element: Element | null,
    callback: ((element: Element) => unknown) | undefined,
  ) => Element | null
  match_assert: (
    f: CompiledResolver[],
    element: Element,
    callback: ((element: Element) => unknown) | undefined,
  ) => boolean
  match_collect: (
    selectors: string[],
    callback: ((element: Element) => unknown) | undefined,
  ) => CompiledResolver[]
  selectorComments: (text: string) => string
  stringContinuations: (selectors: string) => string
  parse: (
    selectors: string | string[] | null,
    type: boolean,
  ) => string[] | false | null | undefined
  match: (
    selectors: string,
    element: Element,
    callback?: (element: Element) => unknown,
  ) => boolean
  matchPublic: (
    selectors: string,
    element: Element,
    callback?: (element: Element) => unknown,
  ) => boolean
  matchForgiving: (list: string[], element: Element) => boolean
  hasChild: (element: Element, tag: string) => boolean
  hasCandidates: (
    token: string,
    context: EngineContext,
  ) => Element[] | ArrayLike<Element>
  has: (argument: string | string[], anchor: Element) => boolean
  firstMatch: () => boolean
  firstRoots:
    | WeakMap<object, CollectionState<PrefixSnapshot>>
    | null
    | undefined
  firstClass: (
    context: EngineContext,
    name: string,
    tag?: string | null | undefined,
    resolver?: CompiledResolver | null | undefined,
    filtered?: Record<string, FilteredNthState>,
  ) => Element | null
  first: (
    selectors: string,
    context?: EngineContext | null,
    callback?: ElementCallback,
  ) => Element | null
  firstCompiled: (
    selectors: string,
    context: EngineContext | null | undefined,
    callback: ElementCallback,
  ) => Element | null
  DESCENT_PROBE: number
  childPlans: PlanCache<{
    tag: string | undefined
    cls: string
    tags: string[]
  } | null>
  selectChildren: (
    selectors: string,
    context: EngineContext,
  ) => Element[] | null
  partCounts: PlanCache<number>
  reTagChain: RegExp
  reChainPart: RegExp
  fetchLevel: (
    part: { cls: string | undefined; tag: string | undefined },
    root: EngineContext,
    out: Element[],
  ) => Element[]
  countPart: (
    part: { cls: string | undefined; tag: string | undefined },
    context: EngineContext,
  ) => number
  descendChain: (
    chain: Array<{ cls: string | undefined; tag: string | undefined }>,
    context: EngineContext,
  ) => Element[] | null
  parseChain: (
    selectors: string,
  ) => Array<{ tag: string | undefined; cls: string | undefined }> | null
  descentDeclined: PlanCache<unknown>
  select: (
    selectors: string,
    context: EngineContext | null | undefined,
    callback?: ElementCallback,
  ) => Element[] | NodeListOf<Element>
  optimize: (selector: string, token: RegExpMatchArray) => string
  collect: (
    selectors: string[],
    context: EngineContext,
    callback: ElementCallback,
    relative?: boolean | undefined,
    firstOnly?: boolean | undefined,
    existenceOnly?: boolean | undefined,
  ) => {
    factory: Array<CompiledResolver | null>
    nodeset: string[]
    results: Element[]
  }
  hoverWanted: boolean
  hoverTracked:
    | WeakMap<Document, { target: EventTarget | null | undefined }>
    | null
    | undefined
  hoverDoc: Document | undefined
  hoverRecord: { target: EventTarget | null | undefined } | undefined
  hoverChanged: (event: MouseEvent) => void
  trackHover: () => void
  _closest: Element['closest']
  _matches: Element['matches']
  _querySelector: Element['querySelector']
  _querySelectorAll: Element['querySelectorAll']
  _querySelectorDoc: Document['querySelector']
  _querySelectorAllDoc: Document['querySelectorAll']
  argsWith: <Value>(args: ArrayLike<Value>, tail: Value) => Value[]
  install: (all?: boolean) => void
  uninstall: () => void
  none: never[]
  lastContext: EngineContext | undefined
  matchLambdas: PlanCache<CompiledResolver | null>
  selectLambdas: PlanCache<CompiledResolver | null>
  matchResolvers: PlanCache<CompiledResolver[]>
  selectResolvers: PlanCache<QueryPlan>
  firstResolvers: PlanCache<QueryPlan>
  hasPlans: PlanCache<RelativePlan[]> | undefined
}
