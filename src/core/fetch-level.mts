import type { EngineState } from './state/engine.d.ts'
import type { ElementCallback, EngineContext } from './types.mts'
export function fetchLevel(
  engine: EngineState,
  part: { cls: string | undefined; tag: string | undefined },
  root: EngineContext,
  out: Element[],
) {
  var found: ArrayLike<Element>, i: number, l: number

  if (part.cls !== undefined) {
    found = engine.collectionSnapshot(
      root.getElementsByClassName!(part.cls),
      root,
      undefined,
      true,
    )
    l = found.length
    if (part.tag === undefined) {
      for (i = 0; l > i; ++i) {
        out[out.length] = found[i]!
      }
    } else {
      for (i = 0; l > i; ++i) {
        if (
          found[i]!.localName == part.tag ||
          (engine.HTML_DOCUMENT &&
            found[i]!.namespaceURI == engine.NAMESPACE &&
            found[i]!.localName == part.tag.toLowerCase())
        ) {
          out[out.length] = found[i]!
        }
      }
    }
  } else {
    found = engine.collectionSnapshot(
      root.getElementsByTagName!(part.tag!),
      root,
      undefined,
      true,
    )
    l = found.length
    for (i = 0; l > i; ++i) {
      out[out.length] = found[i]!
    }
  }

  return out
}

export function countPart(
  engine: EngineState,
  part: { cls: string | undefined; tag: string | undefined },
  context: EngineContext,
) {
  var count: number | undefined,
    key = part.cls !== undefined ? '.' + part.cls : part.tag!

  if ((count = engine.partCounts.get(key)) === undefined) {
    count = (
      part.cls !== undefined
        ? context.getElementsByClassName!(part.cls)
        : context.getElementsByTagName!(part.tag!)
    ).length
    engine.partCounts.set(key, count)
  }

  return count
}

export function descendChain(
  engine: EngineState,
  chain: Array<{ cls: string | undefined; tag: string | undefined }>,
  context: EngineContext,
) {
  var budget = -1,
    i: number,
    j: number,
    k: number,
    l: number,
    level: Element[],
    m: number,
    next: Element[],
    node: Element,
    part: { cls: string | undefined; tag: string | undefined },
    prev: Element | null,
    size: number,
    spent = 0,
    want: number

  // a DocumentFragment has neither lookup, and byClass()/byTag() walk it
  // by hand; the ordinary path already knows how. A legacy host reads its
  // levels through helpers, which is the ordinary path's job as well.
  if (
    engine.Config.LEGACY ||
    !engine.HTML_DOCUMENT ||
    context.nodeType != 9 ||
    !context.getElementsByClassName ||
    !context.getElementsByTagName
  ) {
    return null
  }

  l = chain.length
  level = engine.fetchLevel(chain[0]!, context, [])
  size = level.length

  for (k = 1; l > k; ++k) {
    // What descending costs is one scoped lookup per element of every
    // level it iterates; what it replaces is one pass over the elements of
    // the last part. So that count is the budget, and the levels still to
    // come are bounded by how many elements of their part the whole
    // context holds. Both are counts of a live collection, which is a scan
    // of the context, so they are only asked for once a level is wide
    // enough for the answer to change the route: 0.060ms over 6344
    // elements against 0.78us for the scoped lookup being decided, so a
    // level of a hundred elements is cheaper to iterate than to ask about.
    //
    // A constant limit cannot decide this, because the same number means
    // different things in different documents. 'ul li a' iterates 160 +
    // 604 elements against 2370 anchors and descending wins by 2.6x; '.app
    // .card .row a' iterates 1 + 400 + 800 against 430 anchors and loses.
    // Bounding the levels to come is what declines the second one before
    // it has spent 400 lookups finding that out.
    if (size > engine.DESCENT_PROBE) {
      // A count of zero is not answered as an empty result here. The
      // counts are remembered, and a remembered one can be older than the
      // document: it may only choose between two routes that agree, never
      // stand in for what one of them would have found.
      if (budget < 0) {
        budget = engine.countPart(chain[l - 1]!, context)
      }
      want = spent + size
      for (m = k + 1; l > m; ++m) {
        want += engine.countPart(chain[m - 1]!, context)
      }
      if (want > budget) {
        return null
      }
    }
    spent += size
    part = chain[k]!
    next = []
    prev = null
    for (i = 0, j = level.length; j > i; ++i) {
      node = level[i]!
      // contained by the last element kept, so its matches are already
      // covered and would come back a second time
      if (prev !== null && prev.contains(node)) {
        continue
      }
      prev = node
      engine.fetchLevel(part, node, next)
    }
    level = next
    size = level.length
  }

  return level
}

export function parseChain(engine: EngineState, selectors: string) {
  var i: number,
    l: number,
    match,
    parts: Array<
      string | { tag: string | undefined; cls: string | undefined }
    > = selectors.split('\x20')

  for (i = 0, l = parts.length; l > i; ++i) {
    match = engine.reChainPart.exec(parts[i] as string)
    if (!match || (match![1] === undefined && match[2] === undefined)) {
      return null
    }
    parts[i] = { tag: match![1]!, cls: match![2]! }
  }

  return parts as Array<{
    tag: string | undefined
    cls: string | undefined
  }>
}

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

  resolver = engine.collect(
    engine.parse(selectors, true) as string[],
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

function selectByDescent(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
  callback: ElementCallback,
) {
  let descended
  const children = selectDirectChildren(engine, selectors, context, callback)
  if (children) {
    return children
  }
  // A plain descendant chain of tags is answered by descending, when the
  // shape of the document makes that the cheaper direction. No callback:
  // the ordinary path is what applies one, and this returns the answer
  // rather than a candidate list.
  if (
    selectors &&
    typeof selectors == 'string' &&
    callback === undefined &&
    engine.descentDeclined.get(selectors) === undefined &&
    engine.reTagChain.test(selectors) &&
    !engine.hasForeignTypes(context) &&
    (descended = engine.parseChain(selectors))
  ) {
    descended = engine.descendChain(descended, context)
    if (descended) {
      return !engine.Config.NODE_LIST
        ? descended
        : engine.isInstanceOf(descended)
          ? descended
          : engine.toNodeList(descended)
    }
    engine.descentDeclined.set(selectors, true)
  }

  return undefined
}

function selectDirectChildren(
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
    !engine.hasForeignTypes(context) &&
    context.nodeType == 9 &&
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
        list = engine.fetch[n[i]![0]!]!(n[i]!.slice(1), context!)
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
      list = engine.fetch[n[0]![0]!]!(n[0]!.slice(1), context!)
      nodes = f[0] ? f[0](list, callback, context!, nodes) : (list as Element[])
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

export function optimize(
  _engine: EngineState,
  selector: string,
  token: RegExpMatchArray,
) {
  var index = token.index!,
    length = token[1]!.length + token[2]!.length
  return (
    selector.slice(0, index) +
    (' >+~'.indexOf(selector.charAt(index - 1)) > -1
      ? ':['.indexOf(selector.charAt(index + length + 1)) > -1
        ? '*'
        : ''
      : '') +
    selector.slice(index + length - (token[1] == '*' ? 1 : 0))
  )
}
