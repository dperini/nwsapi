/// <reference types="vite/client" />
import {
  chromiumPolicy,
  jsdomPolicy,
  hasRouteDecisionModelId,
} from '../../../src/core/select/has/route-decision.generated.mts'
import { sources, stages } from './pytorch-has-routing/source.mts'
import type { SourceId } from './pytorch-has-routing/source.mts'
import { element, input, text } from './pytorch-has-routing/ui.mts'
import { initializeSearch } from './pytorch-has-routing/search.mts'
import { routeDirections } from './pytorch-has-routing/dom.mts'
import {
  code,
  initializeHighlighting,
} from './pytorch-has-routing/highlight.mts'
import {
  initializeCalculation,
  renderCalculation,
} from './pytorch-has-routing/calculation.mts'
import {
  initializeImpact,
  renderImpact,
} from './pytorch-has-routing/impact.mts'
import { initializeSectionThemes } from './pytorch-has-routing/theme.mts'
import {
  showSource,
  jumpToSource,
  revealSourceChoice,
} from './pytorch-has-routing/source-view.mts'
import { initializePanelShimmer } from './pytorch-has-routing/panel-shimmer.mts'
import { initializeGuideControls } from './pytorch-has-routing/select.mts'
import { initializeStory, renderStory } from './pytorch-has-routing/story.mts'
import { initializeNarration } from './pytorch-has-routing/narration.mts'
import { renderStoryReadout } from './pytorch-has-routing/story-readout.mts'
import { initializeLinkMarkers } from './pytorch-has-routing/links.mts'
import { initializeLocale } from './pytorch-has-routing/locale.mts'

function guard(label: string, detail: string, passes: boolean) {
  const path = passes ? 'm5 12 4 4 10-10' : 'm6 6 12 12m0-12L6 18'
  return `<li><span class="guard-mark" data-pass="${passes}" role="img" aria-label="${passes ? 'Pass' : 'Fail'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></span><span>${label}<small>${detail}</small></span></li>`
}

function policyState() {
  const anchors = Number(input('anchors').value)
  const witnesses = Number(input('witnesses').value)
  const attributes =
    Number(input('anchor-filter').checked) * 2 +
    Number(input('witness-filter').checked)
  const dense = Number(attributes === 0)
  const ratio = witnesses / anchors
  const enabled = input('planner-enabled').checked
  const forward =
    witnesses > anchors * 2 &&
    (!dense || anchors > 192 || witnesses > anchors * 4)
  const inRange =
    anchors >= 32 &&
    anchors <= 192 &&
    witnesses >= 80 &&
    witnesses <= 768 &&
    ratio >= 2.5 &&
    ratio <= 4
  return {
    anchors,
    witnesses,
    attributes,
    dense,
    ratio,
    enabled,
    forward,
    inRange,
  }
}

function routeSummary(state: ReturnType<typeof policyState>) {
  if (state.anchors < 32) {
    return {
      title: 'Generic selector path',
      detail:
        'Fewer than 32 card candidates. nwsapi uses its generic matching path and skips the model.',
    }
  }
  if (state.witnesses === 0) {
    return {
      title: 'No witness search',
      detail: 'There are no witness candidates, so the exact result is empty.',
    }
  }
  const direction = state.forward ? 'forward' : 'inverse'
  return {
    title: `Search ${routeDirections[direction]}`,
    detail: `The count rule selects ${routeDirections[direction]}ward search (${direction}).`,
  }
}

function plannerSummary(
  state: ReturnType<typeof policyState>,
  override: boolean,
) {
  if (state.anchors < 32 || state.witnesses === 0) {
    return ['Not called', 'The existing selector path handles this query.']
  }
  if (!state.forward) {
    return [
      'Keep searching up',
      'The count rule already chose upward search. The model only reconsiders downward searches.',
    ]
  }
  if (!state.enabled) {
    return ['Keep searching down', 'The optional planner is switched off.']
  }
  if (state.attributes === 0) {
    return [
      'Keep searching down',
      'This query has no supported attribute filter.',
    ]
  }
  if (!state.inRange) {
    return [
      'Keep searching down',
      'The saved function rejects inputs outside its training range.',
    ]
  }
  return override
    ? [
        'Search up instead',
        'Start with warnings and walk up their ancestors. Exact selector checks still decide which cards match.',
      ]
    : [
        'Keep searching down',
        'Continue with the route chosen by the count rule.',
      ]
}

function showPolicyDecision(
  state: ReturnType<typeof policyState>,
  override: boolean,
) {
  const traditional = routeSummary(state)
  const planner = plannerSummary(state, override)
  text('traditional-choice', traditional.title)
  text('traditional-detail', traditional.detail)
  text('decision-title', planner[0]!)
  text('decision-detail', planner[1]!)
}

function canCallPolicy(state: ReturnType<typeof policyState>) {
  return (
    state.enabled &&
    state.anchors >= 32 &&
    state.witnesses > 0 &&
    state.forward &&
    state.attributes !== 0
  )
}

function renderPolicy() {
  document.dispatchEvent(new Event('guide-controls-sync'))
  const state = policyState()
  document
    .querySelectorAll<HTMLButtonElement>('[data-preset]')
    .forEach(button => {
      const preset = presets[button.dataset['preset']!]
      const selected =
        preset !== undefined &&
        state.enabled &&
        state.anchors === preset[0] &&
        state.witnesses === preset[1] &&
        state.attributes === Number(preset[2]) * 2 + Number(preset[3])
      button.setAttribute('aria-pressed', String(selected))
    })
  const {
    anchors,
    witnesses,
    attributes,
    dense,
    ratio,
    enabled,
    forward,
    inRange,
  } = state
  const host = (element('host') as HTMLSelectElement).value
  const policy = host === 'chromium' ? chromiumPolicy : jsdomPolicy
  const reached = canCallPolicy(state)
  const override =
    reached && policy(anchors, witnesses, attributes, dense, ratio)
  text('anchor-output', String(anchors))
  text('witness-output', String(witnesses))
  text(
    'policy-selector',
    `.card${input('anchor-filter').checked ? '[data-ok="1"]' : ''}:has(.warning${input('witness-filter').checked ? '[data-ok="1"]' : ''})`,
  )
  element('guard-list').innerHTML = [
    guard(
      'Enough candidates for this route',
      `${anchors} anchors (need at least 32), ${witnesses} witnesses (need at least 1).`,
      anchors >= 32 && witnesses > 0,
    ),
    guard(
      'The existing route searches down',
      `The count rule selects ${forward ? 'downward' : 'upward'} search. An existing upward search stays unchanged.`,
      forward,
    ),
    guard(
      'The model is enabled and a filter is present',
      `Model ${enabled ? 'enabled' : 'disabled'}. ${attributes ? 'A supported filter is present.' : 'No attribute filter is present.'}`,
      enabled && attributes !== 0,
    ),
    guard(
      'The inputs are within the trained range',
      `32–192 anchors, 80–768 witnesses, ratio 2.5–4. Current ratio: ${ratio.toFixed(2)}.`,
      inRange,
    ),
  ].join('')
  code(
    'policy-inputs',
    `${reached ? 'Called' : 'Not called'}: ${host}Policy(\n  ${anchors}, // anchors\n  ${witnesses}, // witnesses\n  ${attributes}, // attribute mask: card=2, warning=1\n  ${dense}, // dense: both selectors are plain class seeds\n  ${ratio.toFixed(3)}, // witnesses / anchors\n)${reached ? `\nReturns: ${override}` : ''}\n\nModel ID: ${hasRouteDecisionModelId}`,
  )
  showPolicyDecision(state, override)
  renderCalculation(state, host, reached && inRange, override)
  renderImpact(state, reached, override)
}

function navigatePresets(event: KeyboardEvent) {
  const directions: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  }
  const direction = directions[event.key]
  const current = event.target
  if (direction === undefined || !(current instanceof HTMLButtonElement)) {
    return
  }
  const buttons = Array.from(
    element('policy-controls').querySelectorAll<HTMLButtonElement>(
      '[data-preset]',
    ),
  )
  const index = buttons.indexOf(current)
  if (index < 0) {
    return
  }
  event.preventDefault()
  buttons[(index + direction + buttons.length) % buttons.length]!.focus()
  applyPreset(
    buttons[(index + direction + buttons.length) % buttons.length]!.dataset[
      'preset'
    ]!,
  )
}

const presets: Record<string, [number, number, boolean, boolean]> = {
  eligible: [64, 192, true, false],
  tiny: [8, 24, true, false],
  inverse: [64, 64, true, false],
  unfiltered: [64, 192, false, false],
  range: [256, 768, true, false],
}

function applyPreset(name: string) {
  const values = presets[name]
  if (!values) {
    return
  }
  input('anchors').value = String(values[0])
  input('witnesses').value = String(values[1])
  input('anchor-filter').checked = values[2]
  input('witness-filter').checked = values[3]
  input('planner-enabled').checked = true
  renderPolicy()
}

let stageIndex = 0

function showStage(index: number) {
  stageIndex = index
  const stage = stages[index]!
  text('pipeline-title', stage.title)
  text('pipeline-description', stage.description)
  renderStoryReadout(renderStory(index, stage.example))
  document
    .querySelectorAll<HTMLButtonElement>('[data-stage]')
    .forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(Number(button.dataset['stage']) === index),
      )
    })
}

type TrainingRow = {
  id: string
  family: string
  host: string
  decisionReached: boolean
  baselineRoute: string
  features: number[]
  costsNs: number[]
  baselineCostNs: number
  routeFacts: { denseInverse: boolean }
}
let trainingRows: TrainingRow[] = []
let sampleIndex = 0
let sampleStage = 0
let decisionBudgetNs = 0

function selectedRows() {
  const host = (element('sample-host') as HTMLSelectElement).value
  return trainingRows.filter(row => row.host === host)
}

function showSample() {
  const rows = selectedRows()
  if (!rows.length) {
    return
  }
  sampleIndex = (sampleIndex + rows.length) % rows.length
  const row = rows[sampleIndex]!
  const maximum = Math.max(...row.costsNs)
  code(
    'sample-facts',
    `// These facts describe candidates, not matching results.
cardCandidates = ${row.features[0]}
warningCandidates = ${row.features[1]}
cardFilter = ${row.features[2]! >> 1}
warningFilter = ${row.features[2]! & 1}
dense = ${Number(row.routeFacts.denseInverse)}
warningsPerCard = ${row.features[3]}
currentRoute = '${row.baselineRoute}'`,
  )
  element('sample-facts').hidden = sampleStage !== 0
  element('sample-bars').hidden = sampleStage === 0
  element('sample-learning').hidden = sampleStage !== 2
  text('sample-name', `${row.id} · ${sampleIndex + 1} of ${rows.length}`)
  element('sample-bars').innerHTML = ['Search down', 'Search up']
    .map((name, index) => {
      const time = row.costsNs[index]!
      return `<div class="timing-row"><span>${name}</span><div class="timing-track"><div class="timing-fill" style="width:${(time / maximum) * 100}%"></div></div><span>${(time / 1000).toFixed(2)}<span class="time-unit">µs</span></span></div>`
    })
    .join('')
  text(
    'sample-context',
    `Shorter is faster. Archived median costs for both query variants on one ${row.host} fixture, recorded October 5, 2026. ${row.features[0]} card candidates, ${row.features[1]} warning candidates, filter mask ${row.features[2]}. Family: ${row.family}. These development measurements do not benchmark current nwsapi. Source: assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1/dataset/dataset.json.`,
  )
  const inverse = row.costsNs[1]!
  text(
    'sample-label',
    `The recorded downward search costs ${(row.baselineCostNs / 1000).toFixed(2)}µs. Upward search plus the trainer’s ${decisionBudgetNs}ns model budget costs ${((inverse + decisionBudgetNs) / 1000).toFixed(2)}µs. This comparison gives the training label ${inverse + decisionBudgetNs < row.baselineCostNs ? 'switch to upward search (1)' : 'keep searching down (0)'}. The saved model can recommend a different choice. Repeated samples determine whether this comparison is certain enough to influence training.`,
  )
}

async function loadSamples() {
  if (trainingRows.length) {
    return
  }
  try {
    text('sample-name', 'Loading saved measurements…')
    const [dataset, report] = await Promise.all([
      import('../../../assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1/dataset/dataset.json'),
      import('../../../assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1/evaluation.json'),
    ])
    decisionBudgetNs = report.default.decisionBudgetNs
    trainingRows = (dataset.default.rows as TrainingRow[]).filter(
      row =>
        row.family.startsWith('dispatch-crossed-') &&
        Number(row.family.split('-').at(-1)) < 4 &&
        row.decisionReached &&
        row.baselineRoute === 'forward',
    )
    showSample()
  } catch {
    text(
      'sample-name',
      'Could not load the recorded examples. The interactive policy above still runs independently.',
    )
  }
}

function initialize() {
  initializeLocale()
  initializeSectionThemes()
  initializePanelShimmer()
  initializeNarration()
  element('pipeline').innerHTML = stages
    .map(
      (stage, index) =>
        `<button type="button" data-stage="${index}" aria-pressed="${index === 0}">${stage.title}</button>`,
    )
    .join(
      '<svg class="pipeline-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 6 6 6-6 6m8-12 6 6-6 6"/></svg>',
    )
  element('source-list').innerHTML = Object.entries(sources)
    .map(
      ([id, source]) =>
        `<button type="button" data-file="${id}" aria-pressed="false">${source.title}<small>${source.path}</small></button>`,
    )
    .join('')
  initializeSearch()
  initializeCalculation()
  initializeImpact(renderPolicy)
  initializeHighlighting()
  initializeLinkMarkers()
  renderPolicy()
  showStage(0)
  showSource('match')
  initializeGuideControls()
  void initializeStory(() => showStage(stageIndex))
}

function handleClick(event: MouseEvent) {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    'button',
  )
  if (!target) {
    return
  }
  const data = target.dataset
  if (data['preset']) {
    applyPreset(data['preset'])
  }
  if (data['stage']) {
    showStage(Number(data['stage']))
  }
  if (data['file']) {
    showSource(data['file'] as SourceId)
  }
  if (data['source']) {
    jumpToSource(data['source'] as SourceId)
  }
  if (data['sampleStage'] !== undefined) {
    sampleStage = Number(data['sampleStage'])
    document
      .querySelectorAll<HTMLButtonElement>('[data-sample-stage]')
      .forEach(button => {
        button.setAttribute('aria-pressed', String(button === target))
      })
    showSample()
  }
}

initialize()
window.addEventListener('guide-locale-change', () => showStage(stageIndex))
window.addEventListener('resize', revealSourceChoice)
element('story-selector').addEventListener('change', () => showStage(0))
element('story-host').addEventListener('change', () => showStage(0))
element('story-back').addEventListener('click', () =>
  showStage(Math.max(0, stageIndex - 1)),
)
element('story-next').addEventListener('click', () =>
  showStage(Math.min(4, stageIndex + 1)),
)
document.addEventListener('click', handleClick)
element('policy-controls').addEventListener('input', renderPolicy)
element('policy-controls').addEventListener('keydown', navigatePresets)
element('policy-controls').addEventListener('submit', event =>
  event.preventDefault(),
)
element('pipeline-source').addEventListener('click', () =>
  jumpToSource(stages[stageIndex]!.source),
)
element('training-examples').addEventListener('toggle', () => {
  if ((element('training-examples') as HTMLDetailsElement).open) {
    void loadSamples()
  }
})
element('sample-next').addEventListener('click', () => {
  sampleIndex += 1
  showSample()
})
element('sample-previous').addEventListener('click', () => {
  sampleIndex -= 1
  showSample()
})
element('sample-host').addEventListener('change', () => {
  sampleIndex = 0
  showSample()
})
