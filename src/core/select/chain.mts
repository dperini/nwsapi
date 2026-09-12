import type { EngineState, EngineContext } from '../state/types.mts'

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
