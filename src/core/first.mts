import { firstCandidates } from './first-candidates.mts'
import { firstId, firstSimple, notifyFirst } from './first-simple.mts'
import type { EngineState } from './state.d.ts'
import type {
  CompiledResolver,
  ElementCallback,
  EngineContext,
  FilteredNthState,
} from './types.mts'
export function first(
  engine: EngineState,
  selectors: string,
  context?: EngineContext | null,
  callback?: ElementCallback,
) {
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return null
  }
  const lookupContext = context || engine.doc
  const id = firstId(engine, selectors, lookupContext)
  if (id !== false) {
    return notifyFirst(id, callback)
  }
  const simple = firstSimple(engine, selectors, lookupContext)
  if (simple !== false) {
    return notifyFirst(simple, callback)
  }
  if (!engine.Config.LEGACY && typeof selectors === 'string' && selectors) {
    return engine.firstCompiled(selectors, context, callback)
  }
  return (
    engine.select(
      selectors,
      context,
      typeof callback === 'function'
        ? function firstMatchCallback(element: Element) {
            callback(element)
            return false
          }
        : engine.firstMatch,
    )[0] || null
  )
}

export function firstCompiled(
  engine: EngineState,
  selectors: string,
  context: EngineContext | null | undefined,
  callback: ElementCallback,
) {
  var plan,
    resolver: CompiledResolver,
    filtered: Record<string, FilteredNthState> | undefined,
    i: number,
    token: string,
    name,
    api,
    collection: ArrayLike<Element>,
    result: Element | false | null | undefined,
    element = null
  context || (context = engine.doc)
  if (
    engine.lastContext !== context ||
    (context !== engine.doc && context.ownerDocument !== engine.doc)
  ) {
    engine.lastContext = engine.switchContext(context)
  }
  plan = engine.firstResolvers.get(selectors)
  if (!plan) {
    const collected = engine.collect(
      engine.parse(selectors, true) as string[],
      context,
      null,
      false,
      true,
    )
    plan = { factory: collected.factory, nodeset: collected.nodeset }
    engine.firstResolvers.set(selectors, plan)
  }
  for (i = 0; i < plan.nodeset.length; ++i) {
    resolver = plan.factory[i]!
    filtered = resolver.filtered ? {} : undefined
    token = plan.nodeset[i]!
    name = token.slice(1)
    api = engine.method[token[0]! as keyof typeof engine.method] as
      | 'getElementsByTagName'
      | 'getElementsByClassName'
    result =
      token.charCodeAt(0) == 46 /* '.' */ &&
      !/[\t\n\f\r ]/.test(name) &&
      engine.firstClass(context, name, null, resolver, filtered)
    if (result) {
      if (precedes(result, element)) {
        element = result
      }
      continue
    }
    collection = firstCandidates(engine, token, context, name, api)
    result = collection[0]
    {
      scanFirstCandidates()
    }
    if (result && precedes(result, element)) {
      element = result
    }
  }
  return notifyFirst(element, callback)

  function scanFirstCandidates() {
    if (result && !resolver(result, null, context!, false, filtered)) {
      var j = 1,
        length: number
      // Most first matches occur near the start. Defer a live collection's
      // length until a short bounded probe has failed.
      for (; j < 8; ++j) {
        result = collection[j]
        if (!result || resolver(result, null, context!, false, filtered)) {
          break
        }
      }
      if (j === 8) {
        result = null
        for (length = collection.length; j < length; ++j) {
          if (resolver(collection[j]!, null, context!, false, filtered)) {
            result = collection[j]
            break
          }
        }
      }
    }
  }
}

export function selectChildren(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
) {
  var plan = engine.childPlans.get(selectors),
    found: RegExpMatchArray | null,
    roots: ArrayLike<Element>,
    root: Element,
    candidates: ArrayLike<Element>,
    element: Element,
    parent: Element | null,
    previous: Element | undefined,
    results: Element[] = [],
    unordered = false,
    i: number,
    j: number,
    k: number,
    length: number

  if (plan === undefined) {
    // Selective class anchors followed by direct-child type selectors.
    // The general compiler owns escapes, namespaces, and other syntax.
    found =
      /^([a-z][a-z0-9-]*)?\.([_a-zA-Z][-\w]*)([\t\n\f\r ]*>[\t\n\f\r ]*[a-z][a-z0-9-]*(?:[\t\n\f\r ]*>[\t\n\f\r ]*[a-z][a-z0-9-]*)*)$/.exec(
        selectors,
      )
    plan = found
      ? {
          tag: found[1]!,
          cls: found[2]!,
          tags: found[3]!.split(/\s*>\s*/).slice(1),
        }
      : null
    engine.childPlans.set(selectors, plan)
  }
  if (!plan) {
    return null
  }
  roots = context.getElementsByClassName!(plan.cls)
  length = roots.length
  // Decide from live counts before copying or walking a wide anchor set.
  // A changed tree can choose a different route on the next call.
  if (length > engine.DESCENT_PROBE) {
    return null
  }
  if (length >= 16) {
    // One terminal lookup is cheaper than a scoped lookup per anchor when
    // it produces no more candidates than there are anchors to inspect.
    if (
      context.getElementsByTagName!(plan.tags[plan.tags.length - 1]!).length <=
      length
    ) {
      return null
    }
    roots = engine.collectionSnapshot(roots, context!, length)
  }
  {
    collectChildChains()
  }
  if (unordered && results.length > 1) {
    results.sort(engine.documentOrder)
  }
  return results

  function collectChildChains() {
    for (i = 0; i < length; ++i) {
      root = roots[i]!
      if (plan!.tag !== undefined && root.localName != plan!.tag) {
        continue
      }
      if (previous && previous.contains(root)) {
        unordered = true
      }
      previous = root
      // A scoped type lookup skips unrelated children and their subtrees.
      // Validate the fixed parent chain against this exact anchor: nested
      // anchors must neither duplicate nor borrow one another's matches.
      candidates = engine.collectionSnapshot(
        root.getElementsByTagName!(plan!.tags[plan!.tags.length - 1]!),
        root,
        undefined,
        true,
      )
      for (j = 0, k = candidates.length; j < k; ++j) {
        element = candidates[j]!
        parent = element.parentElement
        for (var depth = plan!.tags.length - 2; depth >= 0; --depth) {
          if (!parent || parent.localName != plan!.tags[depth]) {
            break
          }
          parent = parent.parentElement
        }
        if (depth < 0 && parent === root) {
          results[results.length] = element
        }
      }
    }
  }
}

function precedes(result: Element, element: Element | null) {
  return !element || !!(result.compareDocumentPosition(element) & 4)
}
