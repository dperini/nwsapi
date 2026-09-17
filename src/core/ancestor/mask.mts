import type { EngineState, EngineElement } from '../state/types.mts'

export function tagBit(engine: EngineState, name: string) {
  if (engine.HTML_DOCUMENT) {
    name = engine.asciiLower(name)
  }
  var i = 0,
    l = name.length,
    h = 0,
    bit = engine.tagBits[name]
  if (bit !== undefined) {
    return bit
  }
  for (; l > i; ++i) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return (engine.tagBits[name] = 1 << (h & 31))
}

export function ancestorMask(engine: EngineState, node: EngineElement) {
  if (engine.ancestorMasks === null) {
    engine.ancestorMasks = engine.createWeakMap()
  }
  var i: number,
    mask,
    chain = [],
    parent = node.parentElement

  if (parent === engine.lastMaskNode) {
    return engine.lastMaskValue
  }

  // walk up to the nearest ancestor already summarized, iteratively: a
  // recursive form would be bounded by the stack, not by the document
  while (parent) {
    mask = engine.ancestorMasks!.get(parent)
    if (mask !== undefined) {
      break
    }
    chain[chain.length] = parent
    parent = parent.parentElement
  }

  mask = mask === undefined ? 0 : mask | engine.tagBit(parent!.localName)

  // then back down, summarizing each ancestor on the way
  for (i = chain.length - 1; i > -1; --i) {
    engine.ancestorMasks!.set(chain[i]!, mask)
    mask |= engine.tagBit(chain[i]!.localName)
  }

  engine.lastMaskNode = node.parentElement
  engine.lastMaskValue = mask

  return mask
}

export function mayMatch(
  engine: EngineState,
  node: EngineElement,
  mask: number,
  state: { rest: number; kept: number; seen: number },
) {
  // switched off for this selector, and counting down to another look:
  // a document can change shape between one query and the next
  if (state.rest > 0) {
    --state.rest
    return true
  }

  var keep = (engine.ancestorMask(node) & mask) === mask

  if (keep) {
    ++state.kept
  }
  if (++state.seen === engine.FILTER_SAMPLE) {
    if (state.kept >= engine.FILTER_KEEP) {
      state.rest = engine.FILTER_RETRY
    }
    state.seen = 0
    state.kept = 0
  }

  return keep
}

export function clearAncestorMasks(engine: EngineState) {
  engine.ancestorMasks = null
  engine.lastMaskNode = null
  engine.lastMaskValue = 0
  return true
}
