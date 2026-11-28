import { createWasmInstalledQuery } from '../../adapter/wasm-query.mts'
import {
  registerCombinator as registerCombinatorImpl,
  registerOperator as registerOperatorImpl,
  registerSelector as registerSelectorImpl,
} from './register.mts'
import {
  hostSelectorStates,
  hasNativeJqueryResolvers,
  hasUnmarkedSelectorResolvers,
  nativeCustomOperatorForSelector,
  selectorUsesCustomResolver,
  selectorUsesNativeNotEqualOperator,
} from '../../adapter/native-query.mts'
import { initializeNativeBridgeProperties } from './native-bridge-properties.mts'
import type { WasmQueryModule } from '../../adapter/wasm-query.mts'
import { routePlannerPolicy } from '../select/has/policy.mts'
import type { RoutePlannerHost } from '../select/has/policy.mts'
import type { BulkHasPlanner } from '../state/types.mts'
import { hasChild } from '../match/child.mts'
import {
  forgivingWeight,
  queryWeight,
  resolverListWeight,
  resolverWeight,
} from '../cache/weight.mts'
import { firstPosition } from '../compile/position/first.mts'
import type { ChildPlan } from '../state/query.mts'
import { match, matchForgiving, matchPublic } from '../match/selector.mts'
import { parse } from '../parser/selector.mts'
import { argsWith, install, uninstall } from '../dom/install.mts'
import { collect } from '../select/collect.mts'
import { hoverChanged, trackHover } from '../dom/hover.mts'
import {
  countPart,
  descendChain,
  fetchLevel,
  parseChain,
  parseSiblingChain,
  siblingChain,
} from '../select/chain/chain.mts'
import { optimize } from '../compile/optimize.mts'
import { select } from '../select/all.mts'
import { first, firstCompiled, selectChildren } from '../first/select.mts'
import { firstClass } from '../first/class.mts'
import { firstMatch, has, hasCandidates } from '../match/relative.mts'
import type {
  EngineState,
  EngineContext,
  AttributeOperator,
  CompiledResolver,
  LegacyHookFactory,
  QueryPlan,
  SelectorExtension,
} from '../state/types.mts'

export function initializeApi(engine: EngineState) {
  const nativeOperatorGrammar = () =>
    engine.customSyntax &&
    engine.CFG.combinators === engine.registeredSyntax.combinators &&
    (/^(?:(?:[!#%&/@<>~]|\\[?^$*|])?=)(?:\|(?:[!#%&/@<>~]|\\[?^$*|])?=)*$/.test(
      engine.CFG.operators,
    ) ||
      /^\[(?!\^)[~*^$|!#%&/<>?@]+\]=(?:\|=)?$/.test(engine.CFG.operators))
      ? engine.CFG.operators
      : undefined
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
  engine.childPlans = engine.createCache<ChildPlan | null>()
  engine.chainPlans = engine.createCache(256)
  engine.selectChildren = selectChildren.bind(
    null,
    engine,
  ) as EngineState['selectChildren']
  engine.partCounts = engine.createCache<number>()
  engine.reTagChain =
    /^[.A-Za-z][-\w]*(?:\.[-\w]+)?(?:\x20[.A-Za-z][-\w]*(?:\.[-\w]+)?)+$/
  engine.reSiblingChain =
    /^[.A-Za-z][-\w.]*(?:[\t\n\f\r ]*~[\t\n\f\r ]*[.A-Za-z][-\w.]*)+$/
  engine.reChildRoute =
    /^([a-z][a-z0-9-]*)?\.([_a-zA-Z][\-\w]*)(?:[\t\n\f\r ]*>[\t\n\f\r ]*(?:[a-z][a-z0-9-]*(?:\.[_a-zA-Z][\-\w]*)?|\.[_a-zA-Z][\-\w]*|:(?:is|where)\([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+\)))+$/
  engine.reChainPart = /^([A-Za-z][-\w]*)?(?:\.([-\w]+))?$/
  engine.fetchLevel = fetchLevel.bind(null, engine) as EngineState['fetchLevel']
  engine.countPart = countPart.bind(null, engine) as EngineState['countPart']
  engine.descendChain = descendChain.bind(
    null,
    engine,
  ) as EngineState['descendChain']
  engine.parseChain = parseChain.bind(null, engine) as EngineState['parseChain']
  engine.siblingChain = siblingChain.bind(
    null,
    engine,
  ) as EngineState['siblingChain']
  engine.parseSiblingChain = parseSiblingChain.bind(
    null,
    engine,
  ) as EngineState['parseSiblingChain']
  engine.descentDeclined = engine.createCache()
  engine.siblingDeclined = engine.createCache()
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
  engine.pluginPlanReads = 0
  engine.matchLambdas = engine.createCache<CompiledResolver | null>(undefined, {
    publicWrites: true,
    weight: resolverWeight,
  })
  engine.selectLambdas = engine.createCache<CompiledResolver | null>(
    undefined,
    {
      publicWrites: true,
      weight: resolverWeight,
    },
  )
  engine.matchResolvers = engine.createCache<CompiledResolver[]>(undefined, {
    publicWrites: true,
    weight: resolverListWeight,
  })
  engine.forgivingResolvers = engine.createCache<
    Array<CompiledResolver[] | null>
  >(undefined, {
    weight: forgivingWeight,
  })
  engine.selectorGeneration = 0
  engine.selectResolvers = engine.createCache<QueryPlan>(undefined, {
    publicWrites: true,
    weight: queryWeight,
  })
  engine.firstResolvers = engine.createCache<QueryPlan>(undefined, {
    weight: queryWeight,
  })
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
    hasClass: engine.hasClass,
    createWeakMap: engine.createWeakMap,
    mayMatch: engine.mayMatch,
    ancestorMask: engine.ancestorMask,
    clearAncestorMasks: engine.clearAncestorMasks,

    nthOfType: engine.nthOfType,
    nthElement: engine.nthElement,
    firstPosition: firstPosition,
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
    isRadioGroupChecked: engine.isRadioGroupChecked,
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
    matchForgivingKey: engine.matchForgivingKey,
  }
  const resolverCaches = [
    engine.firstResolvers,
    engine.forgivingResolvers,
    engine.matchResolvers,
    engine.selectResolvers,
    engine.matchLambdas,
    engine.selectLambdas,
  ]
  const hasPluginPlans = () =>
    resolverCaches.some(cache => cache.hasExternalEntries?.())
  engine.Dom = {
    get routePlannerHost() {
      return engine.routePlannerHost
    },
    get customBulkHasPlanner() {
      return engine.customBulkHasPlanner
    },
    get customSyntax() {
      return engine.customSyntax
    },
    get hasPluginPlans() {
      return hasPluginPlans()
    },
    get customResolvers() {
      return engine.customResolvers
    },

    // exported cache objects

    matchLambdas: engine.matchLambdas,
    selectLambdas: engine.selectLambdas,

    matchResolvers: engine.matchResolvers,
    selectResolvers: engine.selectResolvers,

    // exported compiler macros

    CFG: engine.CFG,

    S_BODY: engine.S_BODY,
    M_BODY: engine.M_BODY,
    N_BODY: engine.N_BODY,

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

    createWasmInstalledQuery(wasm: WasmQueryModule) {
      const jqueryEnabled = () => hasNativeJqueryResolvers(engine)
      const operatorGrammar = () =>
        wasm.compile_host_selector_with_operator_grammar
          ? nativeOperatorGrammar()
          : undefined
      const unsupportedSyntax = () =>
        engine.customSyntax && operatorGrammar() === undefined
      const query = createWasmInstalledQuery(
        wasm,
        engine.doc,
        engine.directionality,
        engine.Config.LEGACY
          ? undefined
          : (element, selector) =>
              hostSelectorStates(
                engine.doc,
                engine.isFocusable,
                engine.matchesNative,
                element,
                engine,
                selector,
              ),
        jqueryEnabled,
        selector => selectorUsesNativeNotEqualOperator(engine, selector),
        () => engine.Config.FORGIVING,
        () => engine.Config.IDS_DUPES,
        () => engine.Config.ROUTE_PLANNER,
        () => engine.routePlannerHost,
        () => engine.Config.CACHE_LIMIT,
        () => engine.Config.CACHE_BYTES,
        () => engine.customBulkHasPlanner,
        () =>
          hasPluginPlans() ||
          unsupportedSyntax() ||
          engine.customResolvers ||
          hasUnmarkedSelectorResolvers(engine),
        selector =>
          hasPluginPlans() ||
          unsupportedSyntax() ||
          selectorUsesCustomResolver(engine, selector),
        selector => nativeCustomOperatorForSelector(engine, selector),
        () => {
          const readers = engine.legacyHooks
          return engine.Config.LEGACY && readers
            ? {
                readers,
                htmlDocument: engine.HTML_DOCUMENT && !engine.QUIRKS_MODE,
              }
            : undefined
        },
        () =>
          engine.bulkHasPlanner
            ? (anchors, witnesses, attributes, dense, ratio) => {
                try {
                  return (
                    engine.bulkHasPlanner!(
                      anchors,
                      witnesses,
                      attributes,
                      dense,
                      ratio,
                    ) === true
                  )
                } catch {
                  return false
                }
              }
            : undefined,
        operatorGrammar,
      )
      engine.Dom.nativeTraversal = (direction, expression, node) => {
        let mode: string
        let selector: string
        if (direction === 'down' && expression == null) {
          mode = 'none'
          selector = '*'
        } else if (typeof expression === 'number') {
          if (!Number.isSafeInteger(expression) || expression < 0) {
            return null
          }
          mode = `index:${expression}`
          selector = '*'
        } else if (typeof expression === 'string') {
          mode = 'selector'
          selector = expression
        } else {
          mode = 'index:0'
          selector = '*'
        }
        if (node.nodeType !== 1 && node.nodeType !== 9) {
          return undefined
        }
        const result = query(
          `traverse:${direction}:${mode}`,
          selector,
          node as EngineContext,
        )
        return result === undefined ? undefined : (result[0] ?? null)
      }
      return query
    },
    directionality: engine.directionality,
    install: engine.install,
    uninstall: engine.uninstall,

    Operators: engine.Operators,
    Combinators: engine.Combinators,
    Selectors: engine.Selectors,

    useRoutePlanner: function (host: RoutePlannerHost | null) {
      engine.routePlannerHost = host || undefined
      engine.bulkHasPlanner =
        host === null ? undefined : routePlannerPolicy(host)
      engine.customBulkHasPlanner = false
      engine.configure({ ROUTE_PLANNER: host !== null }, true)
    },

    registerBulkHasPlanner: function (planner: BulkHasPlanner | null) {
      if (planner !== null && typeof planner !== 'function') {
        throw new TypeError('Expected a bulk :has() planner function or null')
      }
      engine.bulkHasPlanner = planner || undefined
      engine.routePlannerHost = undefined
      engine.customBulkHasPlanner = planner !== null
      engine.configure({}, true)
    },

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
      engine.initialize(engine.doc)
      engine.configure({}, true)
      return true
    },

    // register a new selector combinator symbol and its related function resolver
    registerCombinator: function (
      combinator: string,
      resolver: (match: RegExpMatchArray) => string,
    ) {
      registerCombinatorImpl(engine, combinator, resolver)
    },

    // register a new attribute operator symbol and its related function resolver
    registerOperator: function (operator: string, resolver: AttributeOperator) {
      registerOperatorImpl(engine, operator, resolver)
    },

    // register a new selector symbol and its related function resolver
    registerSelector: function (
      name: string | number,
      rexp: RegExp,
      func: SelectorExtension['Callback'],
    ) {
      registerSelectorImpl(engine, name, rexp, func)
    },
  }
  initializeNativeBridgeProperties(engine, nativeOperatorGrammar)
}
