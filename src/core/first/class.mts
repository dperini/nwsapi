import { isCssWhitespace } from '../predicate/css-whitespace.mts'
import type {
  EngineState,
  CollectionState,
  CompiledResolver,
  EngineContext,
  FilteredNthState,
  PrefixSnapshot,
} from '../state/types.mts'

export function firstClass(
  engine: EngineState,
  context: EngineContext,
  name: string,
  tag?: string | null | undefined,
  resolver?: CompiledResolver | null | undefined,
  filtered?: Record<string, FilteredNthState>,
) {
  var element: Element | null | undefined,
    next: Element | null,
    value: string,
    offset: number,
    before: number,
    after: number,
    state: CollectionState<PrefixSnapshot> | null | undefined,
    cached: PrefixSnapshot | undefined,
    nodes: Element[],
    candidates: Element[] | undefined,
    i: number,
    view: (Window & typeof globalThis) | null
  if (engine.QUIRKS_MODE) {
    return null
  }
  // A cached prefix depends on subtree order and class text, not the
  // owner document. Adoption preserves it; tag/resolver checks stay live.
  prepareClassCache()
  {
    collectClassPrefix()
    cached = cached!
  }
  candidates = cached.classes.get(name)
  candidates = collectClassCandidates(cached)

  for (
    var candidatesLength = candidates.length, i = 0;
    i < candidatesLength;
    ++i
  ) {
    element = candidates[i]!
    if (
      (!tag || tag == '*' || engine.matchesTag(element, tag)) &&
      (!resolver || resolver(element, null, context, false, filtered))
    ) {
      return element
    }
  }
  return null

  function prepareClassCache() {
    state = engine.firstRoots && engine.firstRoots.get(context)
    if (state) {
      if (state.observer!.takeRecords().length) {
        state.copies = engine.createWeakMap<object, PrefixSnapshot>()!
      }
      cached = state.copies.get(context)
    } else if (
      engine.primordials.WeakRefCtor &&
      (view = ((context.ownerDocument || context) as Document).defaultView) &&
      view.MutationObserver
    ) {
      engine.firstRoots ||
        (engine.firstRoots = engine.createWeakMap<
          object,
          CollectionState<PrefixSnapshot>
        >())
      if (engine.firstRoots) {
        state = {
          copies: engine.createWeakMap<object, PrefixSnapshot>()!,
          observer: null,
        }
        state.observer = (
          engine.Factory as typeof engine.Factory & {
            _observeCollections<Value>(
              root: Node,
              view: Pick<typeof globalThis, 'MutationObserver'>,
              state: CollectionState<Value>,
            ): MutationObserver
          }
        )['_observeCollections'](context, view, state)
        engine.firstRoots.set(context, state)
      }
    }
  }

  function collectClassCandidates(cached: PrefixSnapshot) {
    if (!candidates) {
      candidates = []
      for (
        var cachedNodesLength = cached.nodes.length, i = 0;
        i < cachedNodesLength;
        ++i
      ) {
        element = cached.nodes[i]!
        value = engine.classOf(element)
        offset = -1
        while (value && (offset = value.indexOf(name, offset + 1)) >= 0) {
          before = offset ? value.charCodeAt(offset - 1) : 32 /* space */
          after =
            offset + name.length < value.length
              ? value.charCodeAt(offset + name.length)
              : 32 /* space */
          if (isCssWhitespace(before) && isCssWhitespace(after)) {
            candidates[candidates.length] = element
            break
          }
        }
      }
      cached.classes.set(name, candidates)
    }
    return candidates!
  }

  function collectClassPrefix() {
    if (!cached) {
      nodes = []
      element = context.firstElementChild
      while (element && nodes.length < 16) {
        nodes[nodes.length] = element
        next = element.firstElementChild
        if (!next) {
          while (element !== context && !(next = element.nextElementSibling)) {
            element = element.parentNode as Element | null
            if (!element) {
              break
            }
          }
          if (!element || element === context) {
            break
          }
        }
        element = next
      }
      cached = { nodes: nodes, classes: engine.createCache<Element[]>(64) }
      state && state.copies.set(context, cached)
    }
  }
}
