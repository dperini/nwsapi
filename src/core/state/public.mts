import type {
  LegacyHookFactory,
  LegacyReaders,
  EngineContext,
  EngineElement,
  ElementCallback,
  CompiledResolver,
  QueryPlan,
  FilteredNthState,
  SelectorExtension,
  PlanCache,
  AttributeOperator,
} from './types.mts'
export interface PublicState {
  Snapshot: {
    matchesTag: (element: Element, name: string) => boolean
    mayMatch: (
      node: EngineElement,
      mask: number,
      state: { rest: number; kept: number; seen: number },
    ) => boolean
    ancestorMask: (node: EngineElement) => number
    clearAncestorMasks: () => boolean
    classOf: (e: Element) => string
    includes: LegacyReaders['includes']
    attrOf: LegacyReaders['attrOf']
    hasAttrOf: LegacyReaders['hasAttrOf']
    tagOf: LegacyReaders['tagOf']
    idOf: LegacyReaders['idOf']
    legacyClassOf: LegacyReaders['legacyClassOf']
    upOf: LegacyReaders['upOf']
    nextOf: LegacyReaders['nextOf']
    prevOf: (element: Element) => Element | null
    firstOf: LegacyReaders['firstOf']
    connectedOf: LegacyReaders['connectedOf']
    anchor: Element | null
    isDefined: (element: EngineElement) => boolean
    HOVER?: EventTarget | null | undefined
    doc: Document
    from: Node
    root: Element
    byTag: (
      tag: string,
      context: EngineContext,
    ) => Element[] | NodeListOf<Element>
    has: (argument: string | string[], anchor: Element) => boolean
    hasChild: (element: Element, tag: string) => boolean
    first: (
      selectors: string,
      context?: EngineContext | null,
      callback?: ElementCallback,
    ) => Element | null
    match: (
      selectors: string,
      element: Element,
      callback?: (element: Element) => unknown,
    ) => boolean
    matchForgiving: (list: string[], element: Element) => boolean
    select: (
      selectors: string,
      context: EngineContext | null | undefined,
      callback?: ElementCallback,
    ) => Element[] | NodeListOf<Element>
    ancestor: (
      selectors: string,
      element: Element | null,
      callback: ((element: Element) => unknown) | undefined,
    ) => Element | null
    nthOfType: (
      element: Element | null,
      dir: number,
      stable?: boolean,
    ) => number
    nthElement: (element: Element | null, dir: number) => number
    nthFiltered: (
      element: Element,
      selector: string,
      reverse: boolean,
      state: FilteredNthState | null,
    ) => number
    isMediaState: (media: HTMLMediaElement, state: string) => boolean
    isDirection: (element: Element, direction: string) => boolean
    isLanguage: (element: Element, range: string) => boolean
    isHost: (
      element: Element,
      argument: string | null,
      contextual: boolean,
      scope: Node,
    ) => boolean
    hasSlotted: (element: Element, argument: string | null) => boolean
    shadowParent: (element: Element, scope: Node) => Element | null
    matchesNative: (
      node: EngineElement,
      selector: string,
      unavailable?: boolean | undefined,
    ) => boolean | undefined
    isRequired: (node: EngineElement) => boolean
    isDisabled: (element: EngineElement) => boolean
    isOpen: (node: EngineElement) => boolean | undefined
    isClosed: (node: EngineElement) => boolean | undefined
    isModal: (node: EngineElement) => boolean | undefined
    isFullscreen: (node: EngineElement) => boolean
    isPictureInPicture: (node: EngineElement) => boolean | undefined
    isPopoverOpen: (node: EngineElement) => boolean | undefined
    isFocusable: (node: EngineElement) => false | EngineElement
    isContentEditable: (node: EngineElement) => boolean
    isLink: (node: EngineElement) => boolean
    hasAttributeNS: (
      e: Element,
      name: string,
      pattern?: RegExp,
      expected?: boolean,
    ) => boolean
    attributeValueNS: (e: Element, name: string) => string | null
  }
  Dom: {
    matchLambdas: PlanCache<CompiledResolver | null>
    selectLambdas: PlanCache<CompiledResolver | null>
    matchResolvers: PlanCache<CompiledResolver[]>
    selectResolvers: PlanCache<QueryPlan>
    CFG: { operators: string; combinators: string }
    S_BODY: string
    M_BODY: string
    N_BODY: string
    S_TEST: string
    M_TEST: string
    N_TEST: string
    byId: (id: string, context: EngineContext) => Element[]
    byTag: (
      tag: string,
      context: EngineContext,
    ) => Element[] | NodeListOf<Element>
    byClass: (
      cls: string,
      context: EngineContext,
    ) => Element[] | NodeListOf<Element>
    first: (
      selectors: string,
      context?: EngineContext | null,
      callback?: ElementCallback,
    ) => Element | null
    match: (
      selectors: string,
      element: Element,
      callback?: (element: Element) => unknown,
    ) => boolean
    select: (
      selectors: string,
      context: EngineContext | null | undefined,
      callback?: ElementCallback,
    ) => Element[] | NodeListOf<Element>
    closest: (
      selectors: string,
      element: Element | null,
      callback: ((element: Element) => unknown) | undefined,
    ) => Element | null
    compile: (
      selector: string,
      mode: boolean | null,
      callback: boolean | ElementCallback,
      relative?: boolean,
      existenceOnly?: boolean,
    ) => CompiledResolver | null
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
    emit: (message: string, proto?: TypeErrorConstructor | undefined) => void
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
    Snapshot: {
      matchesTag: (element: Element, name: string) => boolean
      mayMatch: (
        node: EngineElement,
        mask: number,
        state: { rest: number; kept: number; seen: number },
      ) => boolean
      ancestorMask: (node: EngineElement) => number
      clearAncestorMasks: () => boolean
      classOf: (e: Element) => string
      includes: LegacyReaders['includes']
      attrOf: LegacyReaders['attrOf']
      hasAttrOf: LegacyReaders['hasAttrOf']
      tagOf: LegacyReaders['tagOf']
      idOf: LegacyReaders['idOf']
      legacyClassOf: LegacyReaders['legacyClassOf']
      upOf: LegacyReaders['upOf']
      nextOf: LegacyReaders['nextOf']
      prevOf: (element: Element) => Element | null
      firstOf: LegacyReaders['firstOf']
      connectedOf: LegacyReaders['connectedOf']
      anchor: Element | null
      isDefined: (element: EngineElement) => boolean
      HOVER?: EventTarget | null | undefined
      doc: Document
      from: Node
      root: Element
      byTag: (
        tag: string,
        context: EngineContext,
      ) => Element[] | NodeListOf<Element>
      has: (argument: string | string[], anchor: Element) => boolean
      hasChild: (element: Element, tag: string) => boolean
      first: (
        selectors: string,
        context?: EngineContext | null,
        callback?: ElementCallback,
      ) => Element | null
      match: (
        selectors: string,
        element: Element,
        callback?: (element: Element) => unknown,
      ) => boolean
      matchForgiving: (list: string[], element: Element) => boolean
      select: (
        selectors: string,
        context: EngineContext | null | undefined,
        callback?: ElementCallback,
      ) => Element[] | NodeListOf<Element>
      ancestor: (
        selectors: string,
        element: Element | null,
        callback: ((element: Element) => unknown) | undefined,
      ) => Element | null
      nthOfType: (
        element: Element | null,
        dir: number,
        stable?: boolean,
      ) => number
      nthElement: (element: Element | null, dir: number) => number
      nthFiltered: (
        element: Element,
        selector: string,
        reverse: boolean,
        state: FilteredNthState | null,
      ) => number
      isMediaState: (media: HTMLMediaElement, state: string) => boolean
      isDirection: (element: Element, direction: string) => boolean
      isLanguage: (element: Element, range: string) => boolean
      isHost: (
        element: Element,
        argument: string | null,
        contextual: boolean,
        scope: Node,
      ) => boolean
      hasSlotted: (element: Element, argument: string | null) => boolean
      shadowParent: (element: Element, scope: Node) => Element | null
      matchesNative: (
        node: EngineElement,
        selector: string,
        unavailable?: boolean | undefined,
      ) => boolean | undefined
      isRequired: (node: EngineElement) => boolean
      isDisabled: (element: EngineElement) => boolean
      isOpen: (node: EngineElement) => boolean | undefined
      isClosed: (node: EngineElement) => boolean | undefined
      isModal: (node: EngineElement) => boolean | undefined
      isFullscreen: (node: EngineElement) => boolean
      isPictureInPicture: (node: EngineElement) => boolean | undefined
      isPopoverOpen: (node: EngineElement) => boolean | undefined
      isFocusable: (node: EngineElement) => false | EngineElement
      isContentEditable: (node: EngineElement) => boolean
      isLink: (node: EngineElement) => boolean
      hasAttributeNS: (
        e: Element,
        name: string,
        pattern?: RegExp,
        expected?: boolean,
      ) => boolean
      attributeValueNS: (e: Element, name: string) => string | null
    }
    Version: string
    install: (all?: boolean) => void
    uninstall: () => void
    Operators: Record<string, AttributeOperator>
    Selectors: Record<string, SelectorExtension>
    registerLegacyHooks: (factory: LegacyHookFactory) => boolean
    registerCombinator: (
      combinator: string,
      resolver: (match: RegExpMatchArray) => string,
    ) => void
    registerOperator: (operator: string, resolver: AttributeOperator) => void
    registerSelector: (
      name: string | number,
      rexp: RegExp,
      func: SelectorExtension['Callback'],
    ) => void
  }
}
