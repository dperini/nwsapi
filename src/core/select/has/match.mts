import { pureCompiler, pureCompound } from '../../compile/pure.mts'
import type {
  BulkHasPlan,
  EngineContext,
  EngineState,
  QueryPlan,
} from '../../state/types.mts'

export function prepareBulkHas(
  engine: EngineState,
  selector: string,
  context: EngineContext,
): BulkHasPlan | undefined {
  if (!pureCompiler(engine) || !engine.HTML_DOCUMENT) {
    return undefined
  }
  const parts = /^(.+):has\((.+)\)$/.exec(selector)
  if (!parts || !pureCompound(parts[1]!)) {
    return undefined
  }
  const relative = parts[2]!.trim()
  const child = /^>[\t\n\f\r ]*(.+)$/.exec(relative)
  const witness = child ? child[1]!.trim() : relative
  if (!(pureCompound(witness) || (child && pureStateWitness(witness)))) {
    return undefined
  }
  const anchor = plan(engine, parts[1]!, context)
  const witnessPlan = plan(engine, witness, context)
  return {
    anchor,
    witness: witnessPlan,
    directChild: !!child,
    plannerMask: plannerMask(engine, parts[1]!, parts[2]!),
    denseInverse:
      parts[1]![0] === '.' &&
      witness[0] === '.' &&
      parts[1] === anchor.nodeset[0] &&
      witness === witnessPlan.nodeset[0],
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
  if (!witnesses.length) {
    return []
  }
  if (shouldDeclineBulkHas(plan, anchors.length, witnesses.length)) {
    if (
      !engine.Config.ROUTE_PLANNER ||
      !engine.bulkHasPlanner ||
      !plannerOverride(engine, plan, context, anchors.length, witnesses.length)
    ) {
      return null
    }
  }
  const marks = engine.createWeakMap<Element, boolean>()
  if (!marks) {
    return null
  }
  markWitnesses(engine, plan, context, witnesses, marks)
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

function shouldDeclineBulkHas(
  plan: BulkHasPlan,
  anchors: number,
  witnesses: number,
) {
  if (plan.directChild) {
    return witnesses > anchors * 4
  }
  return (
    witnesses > anchors * 2 &&
    (!plan.denseInverse || anchors > 192 || witnesses > anchors * 4)
  )
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

function plannerMask(
  engine: EngineState,
  anchor: string,
  witness: string,
): number | undefined {
  if (!engine.Config.ROUTE_PLANNER || !engine.bulkHasPlanner) {
    return undefined
  }
  // Qualification used simple class seeds with the measured data-ok equality filter.
  const supported = /^\.[A-Za-z_][A-Za-z0-9_-]*(?:\[data-ok=(?:"1"|'1')\])?$/
  if (!supported.test(anchor) || !supported.test(witness)) {
    return undefined
  }
  return (anchor.indexOf('[') < 0 ? 0 : 2) + (witness.indexOf('[') < 0 ? 0 : 1)
}

function pureStateWitness(selector: string) {
  return selector === 'input:checked' || selector === 'option:checked'
}

function plannerOverride(
  engine: EngineState,
  plan: BulkHasPlan,
  context: EngineContext,
  anchors: number,
  witnesses: number,
): boolean {
  if (
    plan.plannerMask === undefined ||
    plan.plannerMask === 0 ||
    !engine.Config.ROUTE_PLANNER ||
    !engine.bulkHasPlanner
  ) {
    return false
  }
  // Plans can be reused with another context. Check current eligibility.
  if (
    context.nodeType !== 9 ||
    engine.QUIRKS_MODE ||
    !engine.HTML_DOCUMENT ||
    !pureCompiler(engine)
  ) {
    return false
  }
  // A failed optional planner keeps the existing matching route.
  try {
    return (
      engine.bulkHasPlanner(
        anchors,
        witnesses,
        plan.plannerMask,
        +plan.denseInverse,
        witnesses / anchors,
      ) === true
    )
  } catch {
    return false
  }
}

function markWitnesses(
  engine: EngineState,
  plan: BulkHasPlan,
  context: EngineContext,
  witnesses: ArrayLike<Element>,
  marks: WeakMap<Element, boolean>,
) {
  const witness = plan.witness.factory[0]
  for (let i = 0, length = witnesses.length; i < length; ++i) {
    const element = witnesses[i]!
    if (!witness || witness(element, null, context, false)) {
      if (plan.directChild) {
        if (element.parentElement) {
          marks.set(element.parentElement, true)
        }
      } else {
        markAncestors(engine, element, context, marks)
      }
    }
  }
}
