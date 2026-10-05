import { pureCompiler, pureCompound } from '../compile/pure.mts'
import type {
  BulkHasPlan,
  EngineContext,
  EngineState,
  QueryPlan,
} from '../state/types.mts'

export function prepareBulkHas(
  engine: EngineState,
  selector: string,
  context: EngineContext,
): BulkHasPlan | undefined {
  if (!pureCompiler(engine) || !engine.HTML_DOCUMENT) {
    return undefined
  }
  const parts = /^(.+):has\((.+)\)$/.exec(selector)
  if (!parts || !pureCompound(parts[1]!) || !pureCompound(parts[2]!)) {
    return undefined
  }
  return {
    anchor: plan(engine, parts[1]!, context),
    witness: plan(engine, parts[2]!, context),
  }
}

function plan(
  engine: EngineState,
  selector: string,
  context: EngineContext,
): QueryPlan {
  const prepared = engine.collect([selector], context, undefined, false, true)
  return { factory: prepared.factory, nodeset: prepared.nodeset }
}

export function selectBulkHas(
  engine: EngineState,
  plan: BulkHasPlan,
  context: EngineContext,
  anchors: ArrayLike<Element>,
): Element[] | null {
  if (anchors.length < 32) {
    return null
  }
  const witnesses = engine.hasCandidates(plan.witness.nodeset[0]!, context)
  if (witnesses.length > anchors.length * 2) {
    return null
  }
  const marks = engine.createWeakMap<Element, boolean>()
  if (!marks) {
    return null
  }
  const witness = plan.witness.factory[0]
  for (let i = 0, length = witnesses.length; i < length; ++i) {
    const element = witnesses[i]!
    if (!witness || witness(element, null, context, false)) {
      markAncestors(engine, element, context, marks)
    }
  }
  const results: Element[] = []
  const anchor = plan.anchor.factory[0]
  for (let i = 0, length = anchors.length; i < length; ++i) {
    const element = anchors[i]!
    if (
      marks.has(element) &&
      (!anchor || anchor(element, null, context, false))
    ) {
      results.push(element)
    }
  }
  return results
}

function markAncestors(
  engine: EngineState,
  element: Element,
  context: EngineContext,
  marks: WeakMap<Element, boolean>,
) {
  let node = engine.upOf(element)
  while (node && node !== context && !marks.has(node)) {
    marks.set(node, true)
    node = engine.upOf(node)
  }
}
