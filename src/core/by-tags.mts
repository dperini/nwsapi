import { skipsCollectionSnapshot } from './skips-collection-snapshot.mts'
import type { EngineState } from './state.d.ts'
import type {
  CollectionSnapshotState,
  CollectionState,
  EngineContext,
  ForeignTypeState,
} from './types.mts'
export function byTags(
  engine: EngineState,
  names: string,
  context: EngineContext,
) {
  if (
    engine.Config.LEGACY ||
    !engine.HTML_DOCUMENT ||
    !context.getElementsByTagName ||
    engine.hasForeignTypes(context)
  ) {
    return engine.byTag('*', context)
  }
  var route = engine.typeRoutes.get(names)
  if (route && --route.remaining > 0 && route.broad) {
    return engine.byTag('*', context)
  }
  var probe = !route || route.remaining <= 0,
    tags = names.split(','),
    seen: Record<string, boolean> = engine.primordials.ObjectCreate(null),
    collections: Array<ArrayLike<Element>> = [],
    count = 0,
    nodes: Element[] = [],
    list: ArrayLike<Element>,
    merged: Element[],
    left: number,
    right: number,
    i: number,
    tag: string
  for (var tagsLength = tags.length, i = 0; i < tagsLength; ++i) {
    tag = tags[i]!.trim()
    if (!seen[tag]) {
      seen[tag] = true
      list = context.getElementsByTagName(tag)
      count += list.length
      collections[collections.length] = list
    }
  }
  // Merge comparisons are host calls too. Dense unions are cheaper as
  // one broad pass. Sample live counts periodically; a stale decision
  // only chooses a slower correct route, never supplies cached results.
  if (probe) {
    route = {
      broad: count > 0 && count * 3 > context.getElementsByTagName('*').length,
      remaining: 64,
    }
    engine.typeRoutes.set(names, route)
    if (route.broad) {
      return engine.byTag('*', context)
    }
  }
  {
    mergeTagCollections()
  }
  return nodes

  function mergeTagCollections() {
    for (
      var collectionsLength = collections.length, i = 0;
      i < collectionsLength;
      ++i
    ) {
      list = engine.sliceCall(collections[i]!)
      if (!nodes.length) {
        nodes = list as Element[]
        continue
      }
      merged = []
      left = right = 0
      // Each lookup is already ordered. Distinct type names are disjoint.
      while (left < nodes.length && right < list.length) {
        merged[merged.length] =
          nodes[left]!.compareDocumentPosition(list[right]!) & 4
            ? nodes[left++]!
            : list[right++]!
      }
      while (left < nodes.length) {
        merged[merged.length] = nodes[left++]!
      }
      while (right < list.length) {
        merged[merged.length] = list[right++]!
      }
      nodes = merged
    }
  }
}

export function collectionSnapshot(
  engine: EngineState,
  nodes: ArrayLike<Element>,
  context: EngineContext,
  length?: number | undefined,
  small?: boolean | undefined,
  identity?: object | undefined,
): ArrayLike<Element> {
  var state: CollectionSnapshotState | undefined,
    root: Node,
    view: (Window & typeof globalThis) | null,
    i: number,
    result: Element[]
  identity = identity || nodes
  const cached = reuseCollectionSnapshot(engine, context, identity)
  if (cached) {
    return cached
  }
  length === undefined && (length = nodes.length)
  if (skipsCollectionSnapshot(length, small, engine, context)) {
    return nodes
  }
  view = ((context.ownerDocument || context) as Document).defaultView
  if (
    !view ||
    !view.MutationObserver ||
    !view.HTMLCollection ||
    !(nodes instanceof view.HTMLCollection)
  ) {
    return nodes
  }
  root = context.getRootNode()
  engine.collectionRoots || (engine.collectionRoots = engine.createWeakMap())
  if (!engine.collectionRoots) {
    return nodes
  }
  state = prepareCollectionState(engine, context, root, view)
  engine.collectionStates || (engine.collectionStates = engine.createWeakMap())
  engine.collectionStates!.set(identity, state)
  // oxlint-disable-next-line unicorn/no-new-array -- dense native collection
  result = new Array<Element>(length)
  for (i = 0; i < length; ++i) {
    result[i] = nodes[i]!
  }
  state.copies.set(identity, result)
  return result
}

function prepareCollectionState(
  engine: EngineState,
  context: EngineContext,
  root: Node,
  view: Window & typeof globalThis,
) {
  let state = engine.collectionRoots!.get(root)
  if (!state) {
    state = {
      copies: engine.createWeakMap()!,
      observer: null,
      document: new engine.primordials.WeakRefCtor!(
        (context.ownerDocument || context) as Document,
      ),
    }
    state.observer = (
      engine.Factory as typeof engine.Factory & {
        _observeCollections<Value>(
          root: Node,
          view: Pick<typeof globalThis, 'MutationObserver'>,
          state: CollectionState<Value>,
        ): MutationObserver
      }
    )['_observeCollections'](root, view, state)
    engine.collectionRoots!.set(root, state)
  } else if (
    state.observer!.takeRecords().length ||
    state.document.deref() !== (context.ownerDocument || context)
  ) {
    state.copies = engine.createWeakMap()!
    state.document = new engine.primordials.WeakRefCtor!(
      (context.ownerDocument || context) as Document,
    )
  }

  return state
}

function reuseCollectionSnapshot(
  engine: EngineState,
  context: EngineContext,
  identity: object,
) {
  let state: CollectionSnapshotState | undefined
  let cached: Element[] | undefined
  if (
    engine.collectionStates &&
    (state = engine.collectionStates.get(identity!))
  ) {
    if (state.observer!.takeRecords().length) {
      state.copies = engine.createWeakMap()!
    }
    cached = state.copies.get(identity!)
    if (
      cached &&
      state.document.deref() === (context.ownerDocument || context)
    ) {
      return cached
    }
  }
  return undefined
}

export function collectionCopy(
  engine: EngineState,
  nodes: ArrayLike<Element>,
  context: EngineContext,
  snapshot?: ArrayLike<Element>,
  identity?: object | undefined,
) {
  snapshot =
    snapshot ||
    (engine.Config.LEGACY
      ? nodes
      : engine.collectionSnapshot(
          nodes,
          context,
          undefined,
          undefined,
          identity,
        ))
  if (snapshot !== nodes) {
    return (snapshot as Element[]).slice()
  }
  var length = nodes.length,
    i: number,
    // oxlint-disable-next-line unicorn/no-new-array -- dense native collection
    result = new Array(length)
  for (i = 0; i < length; ++i) {
    result[i] = nodes[i]
  }
  return result
}

export function asciiLower(_engine: EngineState, name: string) {
  return name.replace(/[A-Z]/g, function (letter: string) {
    return letter.toLowerCase()
  })
}

export function matchesTag(
  engine: EngineState,
  element: Element,
  name: string,
) {
  var local = engine.tagOf(element)
  if (!local || !engine.HTML_DOCUMENT) {
    return local == name
  }
  name = engine.asciiLower(name)
  return (
    (element.namespaceURI == engine.NAMESPACE
      ? local
      : engine.asciiLower(local)) == name
  )
}

export function hasForeignTypes(engine: EngineState, context: EngineContext) {
  if (!engine.HTML_DOCUMENT) {
    return false
  }
  var root = context.getRootNode ? context.getRootNode() : context,
    view =
      ((context.ownerDocument || context) as Document).defaultView ||
      engine.global,
    state: ForeignTypeState | null | undefined,
    node: Element | null,
    foreign = false
  engine.foreignTypeRoots || (engine.foreignTypeRoots = engine.createWeakMap())
  state = engine.foreignTypeRoots && engine.foreignTypeRoots.get(root)
  if (state && !state.dirty && !state.observer!.takeRecords().length) {
    return state.foreign
  }
  node =
    root.nodeType == 1
      ? (root as Element)
      : (root as Document).firstElementChild
  {
    scanForeignElements()
  }
  storeForeignTypes()
  return foreign

  function storeForeignTypes() {
    if (
      !state &&
      engine.foreignTypeRoots &&
      view.MutationObserver &&
      engine.primordials.WeakRefCtor &&
      !engine.Config.LEGACY
    ) {
      state = {
        observer: null,
        foreign: foreign,
        dirty: false,
      }
      state.observer = (
        engine.Factory as typeof engine.Factory & {
          _observeCollections(
            root: Node,
            view: Pick<typeof globalThis, 'MutationObserver'>,
            state: ForeignTypeState,
          ): MutationObserver
        }
      )['_observeCollections'](root, view, state)
      engine.foreignTypeRoots.set(root, state)
    } else if (state) {
      state.foreign = foreign
      state.dirty = false
      state.observer!.takeRecords()
    }
  }

  function scanForeignElements() {
    while (node) {
      if (
        node.namespaceURI != engine.NAMESPACE ||
        node.prefix ||
        /[A-Z]/.test(node.localName)
      ) {
        foreign = true
        break
      }
      if (node.firstElementChild) {
        node = node.firstElementChild
      } else {
        while (node && node !== root && !node.nextElementSibling) {
          node = node.parentElement
        }
        node = node && node !== root ? node.nextElementSibling : null
      }
    }
  }
}

export function byTag(
  engine: EngineState,
  tag: string,
  context: EngineContext,
): Element[] | NodeListOf<Element> {
  var fetchTagCollectionDone = false
  var fetchTagCollectionValue!: Element[] | NodeListOf<Element>

  if (tag != '*' && engine.hasForeignTypes(context)) {
    var all = engine.byTag('*', context),
      matched = []
    for (var index = 0, allLength = all.length; index < allLength; ++index) {
      if (engine.matchesTag(all[index]!, tag)) {
        matched[matched.length] = all[index]!
      }
    }
    return engine.Config.NODE_LIST ? engine.toNodeList(matched) : matched
  }
  if (!engine.HTML_DOCUMENT && tag != '*') {
    return engine.byTagNS(context, tag)
  }
  var e: Element | null,
    nodes!: Element[],
    api = engine.method['*']
  // Legacy hooks filter non-element nodes returned by older hosts.
  {
    fetchTagCollection()
    if (fetchTagCollectionDone) {
      return fetchTagCollectionValue
    }
  }
  return !engine.Config.NODE_LIST
    ? nodes
    : engine.isInstanceOf(nodes)
      ? nodes
      : engine.toNodeList(nodes)

  function fetchTagCollection() {
    if (engine.Config.LEGACY) {
      nodes = engine.legacyHooks!.byTag(tag, context)
    } else if (api in context) {
      // Wildcard membership depends on the context, not collection identity.
      // Hosts can replace a collection after unrelated attribute mutations.
      {
        fetchTagCollectionValue = engine.collectionCopy(
          context[api]!(tag),
          context,
          undefined,
          tag == '*' ? context : undefined,
        )
        fetchTagCollectionDone = true
        return
      }
    } else {
      tag = tag.toLowerCase()
      // DOCUMENT_FRAGMENT_NODE (11)
      if ((e = context.firstElementChild)) {
        if (!(e.nextElementSibling || tag == '*' || e.localName == tag)) {
          {
            fetchTagCollectionValue = engine.sliceCall(e[api](tag))
            fetchTagCollectionDone = true
            return
          }
        } else {
          nodes = []
          do {
            if (tag == '*' || e.localName == tag) {
              nodes[nodes.length] = e
            }
            engine.concatList(nodes, e[api](tag))
          } while ((e = e.nextElementSibling))
        }
      } else {
        nodes = engine.none
      }
    }
  }
}
