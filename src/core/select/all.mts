import type {
  EngineState,
  ElementCallback,
  EngineContext,
  PlanCache,
  QueryPlan,
} from '../state/types.mts'
import { selectCandidates } from './candidates.mts'
import { groupSelectors } from './group.mts'
import { prepareBulkHas, selectBulkHas } from './has/match.mts'

export function select(
  engine: EngineState,
  selectors: string,
  context: EngineContext | null | undefined,
  callback?: ElementCallback,
): Element[] | NodeListOf<Element> {
  var nodes: Element[], resolver

  arguments.length - 1 == 0 && engine.emit(engine.qsNotArgs, TypeError)

  context || (context = engine.doc)
  engine.lastContext !== context &&
    (engine.lastContext = engine.switchContext(context))

  const shortcut = selectByDescent(engine, selectors, context, callback)
  if (shortcut) {
    return shortcut
  }

  if (selectors) {
    const cached = runCachedResolvers(engine, selectors, context, callback)
    if (cached) {
      return cached
    }
  }

  const parsed = engine.parse(selectors, true) as string[]
  resolver = engine.collect(
    callback === undefined && parsed ? groupSelectors(engine, parsed) : parsed,
    context,
    callback,
  )
  nodes = resolver.results

  // Cache the query plan, never the answer. 'results' is a live list of
  // matched elements, so caching the whole collection would keep a
  // removed subtree alive for as long as its
  // selector stayed in the cache. What is kept here is context-free,
  // which also lets a plan be reused across contexts instead of only for
  // the one it was built against.
  engine.selectResolvers.set(selectors, {
    factory: resolver.factory,
    nodeset: resolver.nodeset,
    ...(typeof selectors == 'string' && engine.includes(selectors, ':has(')
      ? { bulkHasSelector: selectors }
      : {}),
  })

  if (typeof callback == 'function') {
    nodes = engine.concatCall(nodes, callback)
  }
  return !engine.Config.NODE_LIST
    ? nodes
    : engine.isInstanceOf(nodes)
      ? nodes
      : engine.toNodeList(nodes)
}

export function selectByDescent(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  let descended
  const direct = selectDirectRoute(engine, selectors, context, callback)
  if (direct) {
    return direct
  }
  const typeUnion = selectTypeUnion(engine, selectors, context, callback)
  if (typeUnion) {
    return typeUnion
  }
  // A plain descendant chain of tags is answered by descending, when the
  // shape of the document makes that the cheaper direction, and a chain
  // of simple parts joined by general siblings is answered by one pass
  // over each candidate parent. No callback: the ordinary path is what
  // applies one, and both routes return the answer rather than a
  // candidate list.
  if (
    callback === undefined &&
    selectors &&
    typeof selectors == 'string' &&
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

function selectDirectRoute(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  const closest = selectByClosest(engine, selectors, context, callback)
  return closest || selectDirectChildren(engine, selectors, context, callback)
}

export function selectByClosest(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  const match =
    typeof selectors == 'string'
      ? /^([a-z][a-z0-9-]*)\.([_a-zA-Z][\w-]*)[\t\n\f\r ]+\.([_a-zA-Z][\w-]*)$/.exec(
          selectors,
        )
      : null
  if (
    !match ||
    callback !== undefined ||
    engine.Config.LEGACY ||
    engine.Config['QUIRKS_MODE'] ||
    !engine.HTML_DOCUMENT ||
    !context.getElementsByClassName ||
    engine.hasForeignTypes(context)
  ) {
    return undefined
  }
  const candidates = context.getElementsByClassName(match[3]!)
  const results: Element[] = []
  const tag = match[1]!
  const cls = match[2]!
  for (let index = 0, length = candidates.length; index < length; ++index) {
    const candidate = candidates[index]!
    let ancestor = candidate.parentElement
    while (
      ancestor &&
      !(
        ancestor.localName == tag &&
        engine.hasClass(engine.classOf(ancestor), cls)
      )
    ) {
      ancestor = ancestor.parentElement
    }
    if (ancestor) {
      results[results.length] = candidate
    }
  }
  return engine.Config.NODE_LIST ? engine.toNodeList(results) : results
}

export function selectTypeUnion(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  if (
    callback !== undefined ||
    engine.Config.LEGACY ||
    !engine.HTML_DOCUMENT ||
    context.nodeType != 9
  ) {
    return undefined
  }
  const match =
    /^(.*[\t\n\f\r ]+):(?:is|where)\(([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+)\)$/.exec(
      selectors,
    )
  if (!match) {
    return undefined
  }
  const prefix = match[1]!.replace(/[\t\n\f\r ]+$/, '')
  const tags = match[2]!.split(',')
  if (
    prefix.charAt(0) == '.' ||
    !engine.reTagChain.test(prefix + ' ' + tags[0]!.trim()) ||
    engine.hasForeignTypes(context)
  ) {
    return undefined
  }
  // Split only simple HTML tag unions so each branch can use the chain route.
  const results: Element[] = [],
    ends = [0],
    tagsLength = tags.length
  for (let index = 0; index < tagsLength; ++index) {
    const selector = prefix + ' ' + tags[index]!.trim()
    const selected = select(engine, selector, context)
    for (
      let offset = 0, selectedLength = selected.length;
      offset < selectedLength;
      ++offset
    ) {
      results[results.length] = selected[offset]!
    }
    ends[ends.length] = results.length
  }
  if (results.length > 1) {
    engine.hasDupes = false
    return engine.mergeResults(results, ends)
  }
  return results
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

export function selectDirectChildren(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  let descended

  if (
    typeof selectors == 'string' &&
    engine.includes(selectors, '>') &&
    callback === undefined &&
    !engine.Config.LEGACY &&
    engine.HTML_DOCUMENT &&
    context.nodeType == 9 &&
    engine.reChildRoute.test(selectors) &&
    !engine.hasForeignTypes(context) &&
    (descended = engine.selectChildren(selectors, context))
  ) {
    return engine.Config.NODE_LIST ? engine.toNodeList(descended) : descended
  }

  return undefined
}

function hasChainRoute(engine: EngineState, selectors: string) {
  return (
    engine.reTagChain.test(selectors) || engine.reSiblingChain.test(selectors)
  )
}

function runCachedResolvers(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  const resolver = engine.selectResolvers.get(selectors)
  if (resolver) {
    let nodes: Element[] = []
    var i: number,
      l: number,
      start,
      ends: number[] | undefined,
      list,
      f = resolver.factory,
      n = resolver.nodeset
    if (n.length > 1) {
      for (i = 0, l = n.length; l > i; ++i) {
        start = nodes.length
        list = selectCandidates(engine, n[i]!, context!, f[i] !== null)
        if (f[i] !== null) {
          f[i]!(list, callback, context!, nodes)
        } else {
          engine.concatList(nodes, list)
        }
        if (start && nodes.length > start) {
          if (ends) {
            ends[ends.length] = nodes.length
          } else {
            ends = [0, start, nodes.length]
          }
        }
      }
      if (ends) {
        nodes = engine.mergeResults(nodes, ends)
      }
    } else if (n.length) {
      nodes = runSingle(engine, resolver, context, callback)
    }
    if (typeof callback == 'function') {
      nodes = engine.concatCall(nodes, callback)
    }
    return !engine.Config.NODE_LIST
      ? nodes
      : engine.isInstanceOf(nodes)
        ? nodes
        : engine.toNodeList(nodes)
  }
  return undefined
}

function runSingle(
  engine: EngineState,
  plan: QueryPlan,
  context: EngineContext,
  callback: ElementCallback,
) {
  const factory = plan.factory[0]
  const list = selectCandidates(
    engine,
    plan.nodeset[0]!,
    context,
    factory !== null,
  )
  if (callback === undefined && list.length >= 32) {
    if (!plan.bulkHas && !plan.bulkHasAttempted && plan.bulkHasSelector) {
      plan.bulkHasAttempted = true
      plan.bulkHas = prepareBulkHas(engine, plan.bulkHasSelector, context)
    }
    if (plan.bulkHas && plan.nodeset[0] === plan.bulkHas.anchor.nodeset[0]) {
      const bulk = selectBulkHas(engine, plan.bulkHas, context, list)
      if (bulk) {
        return bulk
      }
    }
  }
  return factory ? factory(list, callback, context, []) : (list as Element[])
}
