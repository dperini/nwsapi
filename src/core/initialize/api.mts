import {
  hasChild,
  match,
  matchForgiving,
  matchPublic,
  parse,
} from '../ancestor.mts'
import {
  argsWith,
  collect,
  hoverChanged,
  install,
  trackHover,
  uninstall,
} from '../collect.mts'
import {
  countPart,
  descendChain,
  fetchLevel,
  optimize,
  parseChain,
  select,
} from '../fetch-level.mts'
import { first, firstCompiled, selectChildren } from '../first.mts'
import {
  firstClass,
  firstMatch,
  has,
  hasCandidates,
} from '../has-candidates.mts'
import type { EngineState } from '../state/engine.d.ts'
import type {
  AttributeOperator,
  CompiledResolver,
  LegacyHookFactory,
  QueryPlan,
  SelectorExtension,
} from '../types.mts'
export function initializeApi(engine: EngineState) {
  engine.parse = parse.bind(null, engine) as EngineState['parse']
  engine.match = match.bind(null, engine) as EngineState['match']
  engine.matchPublic = matchPublic.bind(
    null,
    engine,
  ) as EngineState['matchPublic']
  engine.matchForgiving = matchForgiving.bind(
    null,
    engine,
  ) as EngineState['matchForgiving']
  engine.hasChild = hasChild.bind(null, engine) as EngineState['hasChild']
  engine.hasCandidates = hasCandidates.bind(
    null,
    engine,
  ) as EngineState['hasCandidates']
  engine.has = has.bind(null, engine) as EngineState['has']
  engine.firstMatch = firstMatch.bind(null, engine) as EngineState['firstMatch']
  engine.firstRoots = null
  engine.firstClass = firstClass.bind(null, engine) as EngineState['firstClass']
  engine.first = first.bind(null, engine) as EngineState['first']
  engine.firstCompiled = firstCompiled.bind(
    null,
    engine,
  ) as EngineState['firstCompiled']
  engine.DESCENT_PROBE = 128
  engine.childPlans = engine.createCache<{
    tag: string | undefined
    cls: string
    tags: string[]
  } | null>()
  engine.selectChildren = selectChildren.bind(
    null,
    engine,
  ) as EngineState['selectChildren']
  engine.partCounts = engine.createCache<number>()
  engine.reTagChain =
    /^[.A-Za-z][-\w]*(?:\.[-\w]+)?(?:\x20[.A-Za-z][-\w]*(?:\.[-\w]+)?)+$/
  engine.reChainPart = /^([A-Za-z][-\w]*)?(?:\.([-\w]+))?$/
  engine.fetchLevel = fetchLevel.bind(null, engine) as EngineState['fetchLevel']
  engine.countPart = countPart.bind(null, engine) as EngineState['countPart']
  engine.descendChain = descendChain.bind(
    null,
    engine,
  ) as EngineState['descendChain']
  engine.parseChain = parseChain.bind(null, engine) as EngineState['parseChain']
  engine.descentDeclined = engine.createCache()
  engine.select = select.bind(null, engine) as EngineState['select']
  engine.optimize = optimize.bind(null, engine) as EngineState['optimize']
  engine.collect = collect.bind(null, engine) as EngineState['collect']
  engine.hoverWanted = false
  engine.hoverTracked = null
  engine.hoverChanged = hoverChanged.bind(
    null,
    engine,
  ) as EngineState['hoverChanged']
  engine.trackHover = trackHover.bind(null, engine) as EngineState['trackHover']
  engine.argsWith = argsWith.bind(null, engine) as EngineState['argsWith']
  engine.install = install.bind(null, engine) as EngineState['install']
  engine.uninstall = uninstall.bind(null, engine) as EngineState['uninstall']
  engine.none = Array<never>()
  engine.matchLambdas = engine.createCache<CompiledResolver | null>()
  engine.selectLambdas = engine.createCache<CompiledResolver | null>()
  engine.matchResolvers = engine.createCache<CompiledResolver[]>()
  engine.selectResolvers = engine.createCache<QueryPlan>()
  engine.firstResolvers = engine.createCache<QueryPlan>()
  engine.Snapshot = {
    doc: engine.doc,
    from: engine.doc,
    root: engine.root,
    anchor: null,

    byTag: engine.byTag,
    includes: engine.includes,
    attrOf: engine.attrOf,
    hasAttrOf: engine.hasAttrOf,
    tagOf: engine.tagOf,
    idOf: engine.idOf,
    legacyClassOf: engine.modernReaders.legacyClassOf,
    upOf: engine.upOf,
    nextOf: engine.nextOf,
    prevOf: engine._prevOf,
    firstOf: engine.firstOf,
    connectedOf: engine.connectedOf,

    has: engine.has,
    hasChild: engine.hasChild,
    first: engine.first,
    match: engine.match,
    matchForgiving: engine.matchForgiving,
    select: engine.select,

    ancestor: engine.ancestor,

    matchesTag: engine.matchesTag,
    mayMatch: engine.mayMatch,
    ancestorMask: engine.ancestorMask,
    clearAncestorMasks: engine.clearAncestorMasks,

    nthOfType: engine.nthOfType,
    nthElement: engine.nthElement,
    nthFiltered: engine.nthFiltered,

    isDirection: engine.isDirection,
    isLanguage: engine.isLanguage,
    isHost: engine.isHost,
    hasSlotted: engine.hasSlotted,
    shadowParent: engine.shadowParent,
    matchesNative: engine.matchesNative,
    isDefined: engine.isDefined,
    isRequired: engine.isRequired,
    isOpen: engine.isOpen,
    isClosed: engine.isClosed,
    isDisabled: engine.isDisabled,
    isModal: engine.isModal,
    isFullscreen: engine.isFullscreen,
    classOf: engine.classOf,
    isPictureInPicture: engine.isPictureInPicture,
    isPopoverOpen: engine.isPopoverOpen,
    isFocusable: engine.isFocusable,
    isContentEditable: engine.isContentEditable,
    isLink: engine.isLink,
    hasAttributeNS: engine.hasAttributeNS,
    attributeValueNS: engine.attributeValueNS,
    isMediaState: engine.isMediaState,
  }
  engine.Dom = {
    // exported cache objects

    matchLambdas: engine.matchLambdas,
    selectLambdas: engine.selectLambdas,

    matchResolvers: engine.matchResolvers,
    selectResolvers: engine.selectResolvers,

    // exported compiler macros

    CFG: engine.CFG,

    S_BODY: engine.S_BODY,
    M_BODY: engine.M_BODY,
    N_BODY: engine.M_BODY,

    S_TEST: engine.S_TEST,
    M_TEST: engine.M_TEST,
    N_TEST: engine.N_TEST,

    // exported engine methods

    byId: engine.byId,
    byTag: engine.byTag,
    byClass: engine.byClass,

    first: engine.first,
    match: engine.matchPublic,
    select: engine.select,

    closest: engine.ancestor,

    compile: engine.compile,
    configure: engine.configure,

    emit: engine.emit,
    Config: engine.Config,
    Snapshot: engine.Snapshot,

    Version: engine.version,

    install: engine.install,
    uninstall: engine.uninstall,

    Operators: engine.Operators,
    Selectors: engine.Selectors,

    // Register the optional module once. Each engine owns its hook state.
    registerLegacyHooks: function (factory: LegacyHookFactory): boolean {
      if (engine.legacyHooks) {
        return false
      }
      engine.legacyHooks = factory({
        MapCtor: engine.primordials.MapCtor,
        WeakMapCtor: engine.primordials.WeakMapCtor,
        StringPrototypeIncludes: engine.primordials.StringPrototypeIncludes,
        isHTML: () => engine.HTML_DOCUMENT,
        isQuirks: () => engine.QUIRKS_MODE,
        byTag: (tag, context) => engine.byTag(tag, context),
      })
      engine.createWeakMap = engine.legacyHooks.createWeakMap
      if (!engine.legacyHooks.hasMap) {
        engine.createCache = engine.legacyHooks.createCache
        engine.typeRoutes = engine.createCache()
        engine.childPlans = engine.createCache()
        engine.partCounts = engine.createCache()
        engine.descentDeclined = engine.createCache()
        engine.hasPlans = undefined
        engine.Dom.matchLambdas = engine.matchLambdas = engine.createCache()
        engine.Dom.selectLambdas = engine.selectLambdas = engine.createCache()
        engine.Dom.matchResolvers = engine.matchResolvers = engine.createCache()
        engine.Dom.selectResolvers = engine.selectResolvers =
          engine.createCache()
        engine.firstResolvers = engine.createCache()
      }
      engine.initialize(engine.doc)
      engine.configure({}, true)
      return true
    },

    // register a new selector combinator symbol and its related function resolver
    registerCombinator: function (
      combinator: string,
      resolver: (match: RegExpMatchArray) => string,
    ) {
      var i = 0,
        l = combinator.length,
        symbol
      for (; l > i; ++i) {
        if (combinator[i] != '=') {
          symbol = combinator[i]
          break
        }
      }
      if (engine.CFG.combinators.indexOf(symbol!) < 0) {
        engine.CFG.combinators = engine.CFG.combinators.replace(
          '](',
          symbol + '](',
        )
        engine.CFG.combinators = engine.CFG.combinators.replace(
          '])',
          symbol + '])',
        )
        engine.Combinators[combinator] = resolver
        engine.setIdentifierSyntax()
      } else {
        console.warn(
          "Warning: the '" + combinator + "' combinator is already registered.",
        )
      }
    },

    // register a new attribute operator symbol and its related function resolver
    registerOperator: function (operator: string, resolver: AttributeOperator) {
      var i = 0,
        l = operator.length,
        symbol
      for (; l > i; ++i) {
        if (operator[i] != '=') {
          symbol = operator[i]
          break
        }
      }
      if (
        engine.CFG.operators.indexOf(symbol!) < 0 &&
        !engine.Operators[operator]
      ) {
        engine.CFG.operators = engine.CFG.operators.replace(']=', symbol + ']=')
        engine.Operators[operator] = resolver
        engine.setIdentifierSyntax()
      } else {
        console.warn(
          "Warning: the '" + operator + "' operator is already registered.",
        )
      }
    },

    // register a new selector symbol and its related function resolver
    registerSelector: function (
      name: string | number,
      rexp: RegExp,
      func: SelectorExtension['Callback'],
    ) {
      engine.Selectors[name] ||
        (engine.Selectors[name] = {
          Expression: rexp,
          Callback: func,
        })
    },
  }
}
