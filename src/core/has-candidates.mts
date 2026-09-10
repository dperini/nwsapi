import { isCssWhitespace } from './is-css-whitespace.mts'
import type { EngineState } from './state.d.ts'
import type {
  CollectionState,
  CompiledResolver,
  EngineContext,
  FilteredNthState,
  PrefixSnapshot,
  RelativePlan,
} from './types.mts'
export function hasCandidates(
  engine: EngineState,
  token: string,
  context: EngineContext,
) {
  var kind = token[0]!,
    name = token.slice(1),
    api = kind == '.' ? engine.method['.'] : engine.method['*'],
    nodes,
    snapshot
  if (
    !engine.Config.LEGACY &&
    (kind == '.' ||
      (kind == '*' &&
        (name == '*' ||
          (engine.HTML_DOCUMENT && !engine.hasForeignTypes(context))))) &&
    !/[\t\n\f\r ]/.test(name) &&
    api in context
  ) {
    nodes = context[api]!(name)
    snapshot = engine.collectionSnapshot(
      nodes,
      context,
      undefined,
      undefined,
      kind == '*' && name == '*' ? context : undefined,
    )
    if (snapshot !== nodes) {
      return snapshot
    }
    return engine.collectionCopy(nodes, context, snapshot)
  }
  return engine.fetch[kind]!(name, context)
}

export function has(
  engine: EngineState,
  argument: string | string[],
  anchor: Element,
): boolean {
  var compileRelativePlansDone = false
  var compileRelativePlansValue!: boolean

  var key =
      typeof argument == 'string'
        ? 's:' + argument
        : 'a:' + JSON.stringify(argument),
    plans = (
      engine.hasPlans ||
      (engine.hasPlans = engine.createCache<RelativePlan[]>())
    ).get(key),
    list,
    parsed,
    normalized,
    range,
    result,
    context,
    root,
    candidates,
    resolver,
    token,
    i: number,
    j: number,
    previousErrors = engine.errors,
    previous = engine.Snapshot.anchor
  engine.Snapshot.anchor = anchor
  try {
    {
      compileRelativePlans()
      plans = plans!
      if (compileRelativePlansDone) {
        return compileRelativePlansValue
      }
    }
    for (i = 0; i < plans.length; ++i) {
      context = plans[i]!.sibling ? engine.upOf(anchor) : anchor
      if (!context) {
        continue
      }
      root = plans[i]!.subtree ? engine.nextOf(anchor) : context
      while (root) {
        if (!plans[i]!.subtree || engine.firstOf(root)) {
          for (j = 0; j < plans[i]!.nodeset.length; ++j) {
            token = plans[i]!.nodeset[j]!
            resolver = plans[i]!.factory[j]
            candidates = engine.hasCandidates(token, root)
            // Keep the original scope while narrowing only the lookup root.
            if (
              resolver
                ? resolver(candidates, null, context, []).length
                : candidates.length
            ) {
              return true
            }
          }
        }
        root = plans[i]!.subtree == 126 ? engine.nextOf(root as Element) : null
      }
    }
    return false
  } finally {
    engine.Snapshot.anchor = previous
  }

  function compileRelativePlans() {
    if (!plans) {
      list = typeof argument == 'string' ? engine.splitList(argument) : argument
      plans = []
      // Compile every branch before accepting any match. Plans contain
      // code and lookup tokens, never anchors or DOM result collections.
      for (i = 0; i < list.length; ++i) {
        if (!list[i]) {
          engine.emit(engine.qsInvalid)
          {
            compileRelativePlansValue = false
            compileRelativePlansDone = true
            return
          }
        }
        parsed = engine.parse('* ' + list[i], true)
        if (!parsed || !parsed.length) {
          {
            compileRelativePlansValue = false
            compileRelativePlansDone = true
            return
          }
        }
        normalized = parsed.map(function (selector: string) {
          return selector.slice(1).replace(/^\s+/, '')
        })
        // A simple sibling type followed by descendants cannot leave that
        // sibling subtree without another sibling or custom combinator.
        range = normalized[0]!.match(
          /^[+~][\t\n\f\r ]*(?:[a-zA-Z][\w-]*|\*)(?:[\t\n\f\r ]+|>)([\s\S]+)$/,
        )
        result = engine.collect(normalized, anchor, undefined, true, true, true)
        plans.push({
          sibling: /^[+~]/.test(list[i]!),
          subtree:
            !engine.Config.LEGACY &&
            normalized.length == 1 &&
            range &&
            !/[+~]/.test(range[1]!) &&
            Object.keys(engine.Combinators).length == 0
              ? normalized[0]!.charCodeAt(0)
              : 0,
          factory: result.factory,
          nodeset: result.nodeset,
        })
      }
      if (engine.errors != previousErrors) {
        {
          compileRelativePlansValue = false
          compileRelativePlansDone = true
          return
        }
      }
      engine.hasPlans!.set(key, plans)
    }
  }
}

export function firstMatch(_engine: EngineState) {
  return false
}

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

  for (i = 0; i < candidates.length; ++i) {
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
      for (i = 0; i < cached.nodes.length; ++i) {
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
