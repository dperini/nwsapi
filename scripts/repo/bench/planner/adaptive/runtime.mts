import type {
  BulkHasPlan,
  EngineContext,
  EngineState,
} from '../../../../../src/core/state/types.mts'

export type Choice = (
  anchors: number,
  processed: number,
  passed: number,
  hits: number,
  candidates: number,
  dense: boolean,
) => boolean

interface Progress {
  next: number
  passed: number
  hits: number
  candidates: number
  results: Element[]
}

export function adaptiveHas(
  engine: EngineState,
  plan: BulkHasPlan,
  context: EngineContext,
  anchors: ArrayLike<Element>,
  prefix: number,
  choose: Choice,
): Element[] | null {
  if (anchors.length < 32 || context.nodeType !== 9) {
    return null
  }
  const progress: Progress = {
    next: 0,
    passed: 0,
    hits: 0,
    candidates: 0,
    results: [],
  }
  forwardTo(
    engine,
    plan,
    context,
    anchors,
    progress,
    Math.min(prefix, anchors.length),
  )
  if (progress.next === anchors.length) {
    return progress.results
  }
  const inverse = choose(
    anchors.length,
    progress.next,
    progress.passed,
    progress.hits,
    progress.candidates,
    plan.denseInverse,
  )
  if (!inverse || !inverseSuffix(engine, plan, context, anchors, progress)) {
    forwardTo(engine, plan, context, anchors, progress, anchors.length)
  }
  return progress.results
}

export function forwardTo(
  engine: EngineState,
  plan: BulkHasPlan,
  context: EngineContext,
  anchors: ArrayLike<Element>,
  progress: Progress,
  end: number,
) {
  const anchor = plan.anchor.factory[0]
  const witness = plan.witness.factory[0]
  while (progress.next < end) {
    const element = anchors[progress.next++]!
    if (anchor && !anchor(element, null, context, false)) {
      continue
    }
    ++progress.passed
    const candidates = engine.hasCandidates(plan.witness.nodeset[0]!, element)
    progress.candidates += candidates.length
    for (let i = 0, length = candidates.length; i < length; ++i) {
      if (!witness || witness(candidates[i]!, null, context, false)) {
        progress.results.push(element)
        ++progress.hits
        break
      }
    }
  }
}

export function inverseSuffix(
  engine: EngineState,
  plan: BulkHasPlan,
  context: EngineContext,
  anchors: ArrayLike<Element>,
  progress: Progress,
) {
  const witnesses = engine.hasCandidates(plan.witness.nodeset[0]!, context)
  if (!witnesses.length) {
    progress.next = anchors.length
    return true
  }
  const marks = engine.createWeakMap<Element, boolean>()
  if (!marks) {
    return false
  }
  const witness = plan.witness.factory[0]
  for (let i = 0, length = witnesses.length; i < length; ++i) {
    const element = witnesses[i]!
    if (!witness || witness(element, null, context, false)) {
      let parent = engine.upOf(element)
      while (parent && parent !== context && !marks.has(parent)) {
        marks.set(parent, true)
        parent = engine.upOf(parent)
      }
    }
  }
  const anchor = plan.anchor.factory[0]
  while (progress.next < anchors.length) {
    const element = anchors[progress.next++]!
    if (
      marks.has(element) &&
      (!anchor || anchor(element, null, context, false))
    ) {
      progress.results.push(element)
    }
  }
  return true
}
