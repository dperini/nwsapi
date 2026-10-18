import { firstCandidates } from './candidates.mts'
import { firstId, firstSimple, notifyFirst } from './simple.mts'
import type {
  EngineState,
  CompiledResolver,
  ElementCallback,
  EngineContext,
  FilteredNthState,
  FirstPositionState,
} from '../state/types.mts'

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
    position: FirstPositionState | undefined,
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
  for (var nodesetLength = plan.nodeset.length, i = 0; i < nodesetLength; ++i) {
    resolver = plan.factory[i]!
    filtered = resolver.filtered ? {} : undefined
    position = resolver.position ? { element: null, index: 0 } : undefined
    token = plan.nodeset[i]!
    name = token.slice(1)
    api = engine.method[token[0]! as keyof typeof engine.method] as
      | 'getElementsByTagName'
      | 'getElementsByClassName'
    result =
      token.charCodeAt(0) == 46 /* '.' */ &&
      !/[\t\n\f\r ]/.test(name) &&
      engine.firstClass(context, name, null, resolver, filtered, position)
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
    if (
      result &&
      !resolver(result, null, context!, false, filtered, position)
    ) {
      var j = 1,
        length: number
      // Most first matches occur near the start. Defer a live collection's
      // length until a short bounded probe has failed.
      for (; j < 8; ++j) {
        result = collection[j]
        if (
          !result ||
          resolver(result, null, context!, false, filtered, position)
        ) {
          break
        }
      }
      if (j === 8) {
        result = null
        for (length = collection.length; j < length; ++j) {
          if (
            resolver(collection[j]!, null, context!, false, filtered, position)
          ) {
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
    roots: ArrayLike<Element>,
    root: Element,
    candidates: ArrayLike<Element>,
    element: Element,
    parent: Element | null,
    previous: Element | undefined,
    results: Element[] = [],
    unordered: boolean,
    overlapping = false,
    directWalk = false,
    terminalsLength = 0,
    i: number,
    j: number,
    k: number,
    length: number

  if (plan === undefined) {
    // Class anchors and plain child compounds avoid parsing general CSS.
    // The general compiler owns escapes, namespaces, and other syntax.
    plan = parseChildPlan(engine, selectors)
    engine.childPlans.set(selectors, plan)
  }
  if (!plan) {
    return null
  }
  terminalsLength = plan.terminals.length
  roots = context.getElementsByClassName!(plan.cls)
  length = roots.length
  directWalk =
    length > engine.DESCENT_PROBE &&
    plan.parts.length >= 2 &&
    plan.parts.length <= 4 &&
    terminalsLength > 1
  // A direct child walk visits terminal alternatives in document order.
  // Sorting is needed only for routes that gather each type separately.
  unordered = terminalsLength > 1 && !directWalk
  // Wide simple routes are cheaper through the ordinary candidate route.
  if (length > engine.DESCENT_PROBE && !directWalk) {
    return null
  }
  if (length >= 16) {
    if (countTerminalCandidates(context, plan.terminals) <= length) {
      return null
    }
    roots = engine.collectionSnapshot(roots, context!, length)
  }
  {
    collectChildChains()
  }
  if (unordered && results.length > 1) {
    results.sort(engine.documentOrder)
    if (overlapping) {
      results = engine.unique(results)
    }
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
        overlapping = true
      }
      previous = root
      if (directWalk) {
        collectDirectChildren(engine, root, plan!, 0, results)
        continue
      }
      // A scoped type lookup skips unrelated children and their subtrees.
      // Validate the fixed parent chain against this exact anchor: nested
      // anchors must neither duplicate nor borrow one another's matches.
      for (
        var terminalIndex = 0;
        terminalIndex < terminalsLength;
        ++terminalIndex
      ) {
        candidates = engine.collectionSnapshot(
          root.getElementsByTagName!(plan!.terminals[terminalIndex]!),
          root,
          undefined,
          true,
        )
        for (j = 0, k = candidates.length; j < k; ++j) {
          element = candidates[j]!
          parent = element.parentElement
          for (var depth = plan!.parts.length - 1; depth >= 0; --depth) {
            if (!parent || !matchesPart(engine, parent, plan!.parts[depth]!)) {
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
}

function collectDirectChildren(
  engine: EngineState,
  parent: Element,
  plan: NonNullable<ReturnType<typeof parseChildPlan>>,
  depth: number,
  results: Element[],
) {
  if (depth === plan.parts.length) {
    for (
      let child = parent.firstElementChild;
      child;
      child = child.nextElementSibling
    ) {
      if (plan.terminals.includes(child.localName)) {
        results[results.length] = child
      }
    }
    return
  }
  const part = plan.parts[depth]!
  for (
    let child = parent.firstElementChild;
    child;
    child = child.nextElementSibling
  ) {
    if (matchesPart(engine, child, part)) {
      collectDirectChildren(engine, child, plan, depth + 1, results)
    }
  }
}

function parseChildPlan(engine: EngineState, selectors: string) {
  const found = engine.reChildRoute.exec(selectors)
  if (!found) {
    return null
  }
  const parts = selectors.split('>')
  const root = /^\s*([a-z][a-z0-9-]*)?\.([_a-zA-Z][\w-]*)\s*$/.exec(parts[0]!)
  if (!root) {
    return null
  }
  const last = parts[parts.length - 1]!.trim()
  const union =
    /^:(?:is|where)\(([a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)+)\)$/.exec(last)
  const terminal = union
    ? union[1]!.split(',').map(tag => tag.trim())
    : /^[a-z][a-z0-9-]*$/.test(last)
      ? [last]
      : null
  if (!terminal) {
    return null
  }
  const intermediate: Array<{
    tag: string | undefined
    cls: string | undefined
  }> = []
  const partsLength = parts.length - 1
  for (let index = 1; index < partsLength; ++index) {
    const part = /^\s*([a-z][a-z0-9-]*)?(?:\.([_a-zA-Z][\w-]*))?\s*$/.exec(
      parts[index]!,
    )
    if (!part || (part[1] === undefined && part[2] === undefined)) {
      return null
    }
    intermediate[intermediate.length] = { tag: part[1], cls: part[2] }
  }
  const terminals = [...new Set(terminal)]
  return {
    tag: root[1],
    cls: root[2]!,
    parts: intermediate,
    terminals,
  }
}

function countTerminalCandidates(context: EngineContext, tags: string[]) {
  let count = 0
  for (let index = 0, tagsLength = tags.length; index < tagsLength; ++index) {
    count += context.getElementsByTagName!(tags[index]!).length
  }
  return count
}

function matchesPart(
  engine: EngineState,
  element: Element,
  part: { tag: string | undefined; cls: string | undefined },
) {
  return (
    (part.tag === undefined || element.localName == part.tag) &&
    (part.cls === undefined ||
      engine.hasClass(engine.classOf(element), part.cls))
  )
}

function precedes(result: Element, element: Element | null) {
  // An identical element never follows itself, which skips the
  // position call when repeated tokens surface the same element.
  return (
    !element ||
    (element !== result && !!(result.compareDocumentPosition(element) & 4))
  )
}
