import type { PolicyInputs } from './calculation.mts'
import { element, input, text } from './ui.mts'

function routeWork(anchors: number, witnesses: number, prefix: number) {
  return {
    forward: { visits: anchors * (3 + prefix), ascents: 0 },
    inverse: { visits: anchors + witnesses, ascents: witnesses * 3 },
  }
}

function time(value: number) {
  return `${(value / 1000).toFixed(2)}µs`
}

export function renderImpact(
  state: PolicyInputs & { forward: boolean },
  reached: boolean,
  override: boolean,
) {
  const prefix = Number(input('impact-prefix').value)
  const visitCost = Number(input('impact-visit').value)
  const ancestorCost = Number(input('impact-ancestor').value)
  const callCost = Number(input('impact-call').value)
  text('impact-prefix-output', String(prefix))
  text('impact-visit-output', `${visitCost}ns`)
  text('impact-ancestor-output', `${ancestorCost}ns`)
  text('impact-call-output', `${callCost}ns`)
  const available = state.anchors >= 32 && state.witnesses >= state.anchors / 2
  element('impact-results').hidden = !available
  text(
    'impact-eligibility',
    available
      ? 'Uses your current candidate counts and the actual saved policy outcome above.'
      : 'Choose Eligible query above. This particular demonstration needs at least 32 cards and enough witnesses to put warnings inside half the cards. Small and empty queries follow different runtime paths.',
  )
  if (!available) {
    return
  }
  const work = routeWork(state.anchors, state.witnesses, prefix)
  const fallback = state.forward ? 'forward' : 'inverse'
  const selected = override ? 'inverse' : fallback
  const base = work[fallback]
  const planned = work[selected]
  const cost = (visits: number, ascents: number) =>
    visits * visitCost + ascents * ancestorCost
  const fallbackTime = cost(base.visits, base.ascents)
  const plannedTime =
    cost(planned.visits, planned.ascents) + (reached ? callCost : 0)
  text('impact-fallback-route', `Ordinary rule → ${fallback}`)
  text('impact-policy-route', `With saved policy → ${selected}`)
  text('impact-fallback-steps', `${base.visits + base.ascents} traversal steps`)
  text(
    'impact-policy-steps',
    `${planned.visits + planned.ascents} traversal steps`,
  )
  text(
    'impact-fallback-detail',
    `${base.visits} visits + ${base.ascents} ancestor steps · no model call`,
  )
  text(
    'impact-policy-detail',
    `${planned.visits} visits + ${planned.ascents} ancestor steps · ${reached ? '1 model call' : 'model skipped'}`,
  )
  text('impact-fallback-time', time(fallbackTime))
  text('impact-policy-time', time(plannedTime))
  const maximum = Math.max(fallbackTime, plannedTime)
  element('impact-fallback-bar').style.width =
    `${(fallbackTime / maximum) * 100}%`
  element('impact-policy-bar').style.width = `${(plannedTime / maximum) * 100}%`
  const change = ((plannedTime - fallbackTime) / fallbackTime) * 100
  text(
    'impact-difference',
    change === 0
      ? 'Same illustrative time.'
      : `${Math.abs(change).toFixed(1)}% ${change < 0 ? 'less' : 'more'} time under these assumptions.`,
  )
  text(
    'impact-explanation',
    `${state.anchors} cards, ${state.witnesses} warnings. Every card has one nested section with ${prefix} neutral elements. Half then contain warnings. The other half end with a footer and no warning. Inverse walks through the section, card, and document for every warning, then filters cards in order. Changing the DOM shape here does not change the inputs the saved model sees.`,
  )
  text(
    'impact-formula',
    `estimated time = visits × ${visitCost}ns + ancestor steps × ${ancestorCost}ns + ${reached ? callCost : 0}ns model overhead (policy lane only)`,
  )
}

export function initializeImpact(refresh: () => void) {
  element('impact-controls').addEventListener('input', refresh)
  document
    .querySelectorAll<HTMLButtonElement>('[data-impact-prefix]')
    .forEach(button => {
      button.addEventListener('click', () => {
        input('impact-prefix').value = button.dataset['impactPrefix']!
        refresh()
      })
    })
}
