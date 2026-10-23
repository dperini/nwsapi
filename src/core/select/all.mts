import type {
  EngineState,
  ElementCallback,
  EngineContext,
  QueryPlan,
} from '../state/types.mts'
import { selectCandidates } from './candidates.mts'
import { selectChainRoutes } from './chain-routes.mts'
import { groupSelectors } from './group.mts'
import { prepareBulkHas, selectBulkHas } from './has/match.mts'
import { selectScopedTypeUnion, splitUnionTypes } from './scoped-union.mts'

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

  if (selectors) {
    const cached = runCachedResolvers(engine, selectors, context, callback)
    if (cached) {
      return cached
    }
  }

  const shortcut = selectByDescent(engine, selectors, context, callback)
  if (shortcut) {
    return shortcut
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
  const direct = selectDirectRoute(engine, selectors, context, callback)
  if (direct) {
    return direct
  }
  const typeUnion = selectTypeUnion(engine, selectors, context, callback)
  if (typeUnion) {
    return typeUnion
  }
  return selectChainRoutes(engine, selectors, context, callback)
}

export function selectClassDescendantTypeUnion(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  if (!hasClassDescendantTypeUnionShape(selectors)) {
    return undefined
  }
  if (!supportsClassDescendantTypeUnion(engine, context, callback)) {
    return undefined
  }
  const match = parseClassDescendantTypeUnion(selectors)
  if (!match || engine.hasForeignTypes(context)) {
    return undefined
  }
  const roots = context.getElementsByClassName!(match[1]!)
  const rootsLength = roots.length
  if (!denseClassRoots(context, rootsLength)) {
    return undefined
  }
  const tags = new Set(match[2]!.split(/[\t\n\f\r ]*,[\t\n\f\r ]*/))
  const results = collectClassUnion(tags, roots, rootsLength)
  return engine.Config.NODE_LIST ? engine.toNodeList(results) : results
}

function hasClassDescendantTypeUnionShape(selectors: string) {
  return (
    typeof selectors == 'string' &&
    selectors.charCodeAt(0) == 46 &&
    (selectors.indexOf(':is(') >= 0 || selectors.indexOf(':where(') >= 0)
  )
}

function supportsClassDescendantTypeUnion(
  engine: EngineState,
  context: EngineContext,
  callback: ElementCallback,
) {
  return (
    callback === undefined &&
    !engine.Config.LEGACY &&
    !engine.QUIRKS_MODE &&
    engine.HTML_DOCUMENT &&
    context.nodeType == 9 &&
    !!context.getElementsByClassName
  )
}

function parseClassDescendantTypeUnion(selectors: string) {
  return /^\.([_a-zA-Z][\w-]*)[\t\n\f\r ]+:(?:is|where)\(([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+)\)$/.exec(
    selectors,
  )
}

function denseClassRoots(context: EngineContext, rootsLength: number) {
  return (
    rootsLength >= 16 &&
    context.getElementsByTagName!('*').length <= rootsLength * 32
  )
}

function collectClassUnion(
  tags: Set<string>,
  roots: HTMLCollectionOf<Element>,
  rootsLength: number,
) {
  const results: Element[] = []
  let previous: Element | undefined
  for (let index = 0; index < rootsLength; ++index) {
    const root = roots[index]!
    if (previous && previous.contains(root)) {
      continue
    }
    previous = root
    const descendants = root.getElementsByTagName('*')
    for (
      let offset = 0, descendantsLength = descendants.length;
      offset < descendantsLength;
      ++offset
    ) {
      const descendant = descendants[offset]!
      if (tags.has(descendant.localName)) {
        results[results.length] = descendant
      }
    }
  }
  return results
}

function selectDirectRoute(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  const closest = selectByClosest(engine, selectors, context, callback)
  return (
    closest ||
    selectDirectChildren(engine, selectors, context, callback) ||
    selectClassDescendantTypeUnion(engine, selectors, context, callback)
  )
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
    engine.QUIRKS_MODE ||
    !engine.HTML_DOCUMENT ||
    !context.getElementsByClassName ||
    engine.hasForeignTypes(context)
  ) {
    return undefined
  }
  const liveCandidates = context.getElementsByClassName(match[3]!)
  const candidates = engine.collectionSnapshot(liveCandidates, context)
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
    (typeof selectors === 'string' &&
      selectors.charCodeAt(selectors.length - 1) !== 41) ||
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
  const tags = splitUnionTypes(match[2]!)
  if (
    prefix.charAt(0) == '.' ||
    !engine.reTagChain.test(prefix + ' ' + tags[0]!) ||
    engine.hasForeignTypes(context)
  ) {
    return undefined
  }
  const results =
    selectScopedTypeUnion(engine, selectors, prefix, tags, context) ||
    selectTypeUnionBranches(engine, prefix, tags, context)
  return engine.Config.NODE_LIST ? engine.toNodeList(results) : results
}

export function selectTypeUnionBranches(
  engine: EngineState,
  prefix: string,
  tags: string[],
  context: EngineContext,
) {
  // Split only simple HTML tag unions so each branch can use the chain route.
  const results: Element[] = [],
    ends = [0],
    tagsLength = tags.length
  for (let index = 0; index < tagsLength; ++index) {
    const selector = prefix + ' ' + tags[index]!
    const selected = select(engine, selector, context)
    for (
      let offset = 0, selectedLength = selected.length;
      offset < selectedLength;
      ++offset
    ) {
      results[results.length] = selected[offset]!
    }
    if (results.length > ends[ends.length - 1]!) {
      ends[ends.length] = results.length
    }
  }
  if (results.length > 1) {
    engine.hasDupes = false
    return engine.mergeResults(results, ends)
  }
  return results
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
    !engine.QUIRKS_MODE &&
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

export function runSingle(
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
