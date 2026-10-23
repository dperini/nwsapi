import type {
  EngineState,
  ElementCallback,
  EngineContext,
  PlanCache,
} from '../../state/types.mts'
import { siblingChildChain } from './chain.mts'

export function selectChainRoutes(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  const siblingChild = selectSiblingChildChain(
    engine,
    selectors,
    context,
    callback,
  )
  if (siblingChild !== undefined) {
    return siblingChild
  }
  return selectSimpleChains(engine, selectors, context, callback)
}

function selectSiblingChildChain(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  if (callback !== undefined || typeof selectors !== 'string') {
    return undefined
  }
  const results = siblingChildChain(engine, selectors, context)
  if (results === null) {
    return undefined
  }
  return engine.Config.NODE_LIST ? engine.toNodeList(results) : results
}

function selectSimpleChains(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  let descended
  // Descendant tag chains and simple general-sibling chains have their own
  // scans. Each scan declines when its document shape makes it a poor fit.
  if (
    callback === undefined &&
    selectors &&
    typeof selectors === 'string' &&
    !engine.Config.LEGACY &&
    engine.HTML_DOCUMENT &&
    context.nodeType == 9 &&
    hasChainRoute(engine, selectors) &&
    !engine.hasForeignTypes(context)
  ) {
    descended =
      chainByParts(selectors, context, {
        declined: engine.descentDeclined,
        grammar: engine.reTagChain,
        parse: engine.parseChain,
        answer: engine.descendChain,
      }) ||
      chainByParts(selectors, context, {
        declined: engine.siblingDeclined,
        grammar: engine.reSiblingChain,
        parse: engine.parseSiblingChain,
        answer: engine.siblingChain,
      })
    if (descended) {
      return !engine.Config.NODE_LIST
        ? descended
        : engine.isInstanceOf(descended)
          ? descended
          : engine.toNodeList(descended)
    }
  }

  return undefined
}

function chainByParts(
  selectors: string,
  context: EngineContext,
  chain: {
    declined: PlanCache<unknown>
    grammar: RegExp
    parse: (
      selectors: string,
    ) => Array<{ tag: string | undefined; cls: string | undefined }> | null
    answer: (
      parts: Array<{ cls: string | undefined; tag: string | undefined }>,
      context: EngineContext,
    ) => Element[] | null
  },
) {
  let descended
  if (
    chain.declined.get(selectors) === undefined &&
    chain.grammar.test(selectors) &&
    (descended = chain.parse(selectors))
  ) {
    descended = chain.answer(descended, context)
    if (descended) {
      return descended
    }
    // A declined answer is a decision about document shape, which the
    // selector remembers the way the descendant route does.
    chain.declined.set(selectors, true)
  }
  return undefined
}

function hasChainRoute(engine: EngineState, selectors: string) {
  return (
    engine.reTagChain.test(selectors) || engine.reSiblingChain.test(selectors)
  )
}
