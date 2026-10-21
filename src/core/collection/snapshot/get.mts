import { skipsCollectionSnapshot } from './skip.mts'
import type {
  EngineState,
  CollectionSnapshotState,
  CollectionState,
  EngineContext,
} from '../../state/types.mts'

export function collectionSnapshot(
  engine: EngineState,
  nodes: ArrayLike<Element>,
  context: EngineContext,
  length?: number | undefined,
  small?: boolean | undefined,
  identity?: object | undefined,
  tagOnly?: boolean | undefined,
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
  state = prepareCollectionState(engine, context, root, view, tagOnly)
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

export function prepareCollectionState(
  engine: EngineState,
  context: EngineContext,
  root: Node,
  view: Window & typeof globalThis,
  tagOnly?: boolean | undefined,
) {
  let states = engine.collectionRoots!.get(root)
  if (!states) {
    states = {}
    engine.collectionRoots!.set(root, states)
  }
  const key = tagOnly ? 'tags' : 'classes'
  let state = states[key]
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
          attributes?: boolean,
        ): MutationObserver
      }
    )['_observeCollections'](root, view, state, !tagOnly)
    states[key] = state
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

export function reuseCollectionSnapshot(
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
