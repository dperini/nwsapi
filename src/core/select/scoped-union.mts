import type { EngineContext, EngineState } from '../state/types.mts'

export interface UnionTypePart {
  tag: string
  cls: undefined
}

export function splitUnionTypes(types: string) {
  const tags = types.split(/[\t\n\f\r ]*,[\t\n\f\r ]*/)
  if (tags.length === 2 && tags[0] !== tags[1]) {
    return tags
  }
  return Array.from(new Set(tags))
}

export function selectScopedTypeUnion(
  engine: EngineState,
  selector: string,
  prefix: string,
  tags: string[],
  context: EngineContext,
) {
  if (
    tags.length < 2 ||
    engine.QUIRKS_MODE ||
    engine.hasExtensions ||
    engine.descentDeclined.get(selector) === true
  ) {
    return null
  }
  const chain = engine.parseChain(prefix)
  if (!chain) {
    return null
  }
  // Counts only choose a route. Every accepted query reads fresh descendants.
  if (
    engine.countPart(chain[chain.length - 1]!, context) >
      engine.DESCENT_PROBE ||
    !tags.some(tag => engine.countPart({ tag, cls: undefined }, context) > 0)
  ) {
    engine.descentDeclined.set(selector, true)
    return null
  }
  const selected = engine.descendChain(chain, context)
  if (!selected || selected.length > engine.DESCENT_PROBE) {
    engine.descentDeclined.set(selector, true)
    return null
  }
  return selectUnionRoots(engine, outerRoots(selected), tags)
}

export function selectUnionRoots(
  engine: EngineState,
  roots: Element[],
  tags: string[],
) {
  if (roots.length === 1) {
    return selectUnionRoot(engine, roots[0]!, tags)
  }
  if (tags.length === 2) {
    return selectUnionPairRoots(engine, roots, tags[0]!, tags[1]!)
  }
  let results: Element[] = []
  for (let index = 0, length = roots.length; index < length; ++index) {
    const group = selectUnionRoot(engine, roots[index]!, tags)
    if (results.length === 0) {
      results = group
    } else {
      for (
        let offset = 0, groupLength = group.length;
        offset < groupLength;
        ++offset
      ) {
        results[results.length] = group[offset]!
      }
    }
  }
  return results
}

export function selectUnionPairRoots(
  engine: EngineState,
  roots: Element[],
  firstTag: string,
  secondTag: string,
) {
  const first = { tag: firstTag, cls: undefined }
  const second = { tag: secondTag, cls: undefined }
  const results: Element[] = []
  for (let index = 0, length = roots.length; index < length; ++index) {
    appendUnionPair(engine, first, second, roots[index]!, results)
  }
  return results
}

export function appendUnionPair(
  engine: EngineState,
  first: UnionTypePart,
  second: UnionTypePart,
  root: Element,
  output: Element[],
) {
  const left = engine.fetchLevel(first, root, [])
  const right = engine.fetchLevel(second, root, [])
  const leftLength = left.length
  const rightLength = right.length
  let leftIndex = 0
  let rightIndex = 0
  let offset = output.length
  // Distinct terminal types cannot share an element, so no deduplication is needed.
  while (leftIndex < leftLength && rightIndex < rightLength) {
    const a = left[leftIndex]!
    const b = right[rightIndex]!
    if (a.compareDocumentPosition(b) & 4) {
      output[offset++] = a
      ++leftIndex
    } else {
      output[offset++] = b
      ++rightIndex
    }
  }
  while (leftIndex < leftLength) {
    output[offset++] = left[leftIndex++]!
  }
  while (rightIndex < rightLength) {
    output[offset++] = right[rightIndex++]!
  }
  return output
}

export function selectUnionRoot(
  engine: EngineState,
  root: Element,
  tags: string[],
) {
  const results: Element[] = []
  const ends = [0]
  for (let index = 0, length = tags.length; index < length; ++index) {
    const start = results.length
    const part = { tag: tags[index]!, cls: undefined }
    engine.fetchLevel(part, root, results)
    if (results.length > start) {
      ends[ends.length] = results.length
    }
  }
  if (ends.length < 3) {
    return results
  }
  engine.hasDupes = false
  return engine.mergeResults(results, ends)
}

export function outerRoots(selected: Element[]) {
  const roots: Element[] = []
  let previous: Element | undefined
  for (let index = 0, length = selected.length; index < length; ++index) {
    const root = selected[index]!
    if (previous && previous.contains(root)) {
      continue
    }
    roots[roots.length] = root
    previous = root
  }
  return roots
}
