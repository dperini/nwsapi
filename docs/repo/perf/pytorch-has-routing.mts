/// <reference types="vite/client" />
import {
  chromiumPolicy,
  jsdomPolicy,
  hasRouteDecisionModelId,
} from '../../../src/core/select/has/route-decision.generated.mts'
import { sources, stages } from './pytorch-has-routing/source.mts'
import type { SourceId } from './pytorch-has-routing/source.mts'

function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing guide element: ${id}`)
  }
  return found
}

function text(id: string, value: string) {
  element(id).textContent = value
}

function input(id: string) {
  return element(id) as HTMLInputElement
}

const cardNames = ['A', 'B', 'C', 'D']
const warnings = [true, false, true, false]
let route = 'forward'
let step = 0
let trace: Array<{ target: string; description: string }> = []
const fixture = document.createElement('main')

function renderFixture() {
  fixture.innerHTML =
    cardNames
      .map(
        (name, index) =>
          `<article class="card" id="card-${name}"><span>Card ${name}</span>${warnings[index] ? `<span class="warning" id="warning-${name}">Warning</span>` : ''}</article>`,
      )
      .join('') +
    '<span class="warning" id="outside-warning">Outside warning</span>'
}

function exactResults() {
  const cards = Array.from(fixture.querySelectorAll<HTMLElement>('.card'))
  const forward = cards.filter(card => card.querySelector('.warning'))
  const marked = new Set(
    Array.from(fixture.querySelectorAll('.warning')).map(witness =>
      witness.closest('.card'),
    ),
  )
  const inverse = cards.filter(card => marked.has(card))
  if (
    forward.map(card => card.id).join() !== inverse.map(card => card.id).join()
  ) {
    throw new Error('The two illustrated routes disagree')
  }
  return forward.map(card => card.id.replace('card-', ''))
}

function buildTrace() {
  if (route === 'forward') {
    trace = cardNames.map((name, index) => ({
      target: `card-${name}`,
      description: `Start with card ${name}. Search its descendants. ${warnings[index] ? `A warning is present, so keep card ${name}.` : `No warning is present, so skip card ${name}.`}`,
    }))
    return
  }
  trace = cardNames
    .filter((_, index) => warnings[index])
    .map(name => ({
      target: `card-${name}`,
      description: `Start with the warning inside card ${name}. Walk upward and mark its ancestors. Card ${name} is among those ancestors.`,
    }))
  trace.push({
    target: 'outside-node',
    description:
      'Visit the outside warning. None of its ancestors is a card. It adds no matching card.',
  })
  trace.push({
    target: '',
    description: `Visit the anchor candidates in document order and retain the marked cards. Return ${exactResults().join(', ') || 'an empty list'}.`,
  })
}

function showStep() {
  const current = trace[step - 1]
  document.querySelectorAll<HTMLElement>('[data-current]').forEach(node => {
    node.dataset['current'] = String(node.id === current?.target)
  })
  text('step-count', `STEP ${step} OF ${trace.length}`)
  text(
    'trace-description',
    current?.description || 'Ready. Press “Next step” to start the search.',
  )
  ;(element('step-next') as HTMLButtonElement).disabled = step >= trace.length
}

function renderSearch() {
  renderFixture()
  const matches = exactResults()
  element('dom-cards').innerHTML = cardNames
    .map(
      (name, index) =>
        `<article class="dom-card" id="card-${name}" data-current="false" data-match="${matches.includes(name)}"><h3>Card ${name}</h3><code>&lt;article class="card"&gt;</code><button type="button" data-warning="${index}" aria-pressed="${warnings[index]}" aria-label="Toggle warning in card ${name}"><span class="warning-node">${warnings[index] ? '● .warning' : '+ Add .warning'}</span></button></article>`,
    )
    .join('')
  text(
    'match-result',
    matches.length
      ? matches.map(name => `Card ${name}`).join(' · ')
      : 'No matching cards',
  )
  text(
    'route-explanation',
    route === 'forward'
      ? 'Start at each possible card. Look inside it for a warning.'
      : 'Start at the warnings. Walk upward to mark ancestors, then keep matching cards in document order.',
  )
  step = 0
  buildTrace()
  showStep()
}

function guard(label: string, detail: string, passes: boolean) {
  return `<li><span class="guard-mark" data-pass="${passes}" aria-label="${passes ? 'Pass' : 'Fail'}">${passes ? '✓' : '×'}</span><span>${label}<small>${detail}</small></span></li>`
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

function showPolicyDecision(
  state: ReturnType<typeof policyState>,
  override: boolean,
) {
  const { anchors, witnesses, attributes, enabled, forward, inRange } = state
  const blockers = [
    [!enabled, 'Planner disabled. The current route is retained.'],
    [
      anchors < 32,
      'Fewer than 32 anchors. The bulk route and model are skipped.',
    ],
    [
      witnesses === 0,
      'No witness candidates. The exact result is empty. No model call is needed.',
    ],
    [
      !forward,
      'The existing routing rule already chooses inverse matching. The model cannot replace that decision.',
    ],
    [
      attributes === 0,
      'This query has no supported attribute filter. The runtime does not call the model.',
    ],
    [
      !inRange,
      'The saved policy declines inputs outside its supported range. Keep forward matching.',
    ],
  ] as const
  const blocker = blockers.find(([blocked]) => blocked)
  text('decision-label', blocker ? 'Guard outcome' : 'Saved policy outcome')
  text(
    'decision-title',
    blocker
      ? 'Keep the existing behavior'
      : override
        ? 'Override → inverse'
        : 'Keep → forward',
  )
  text(
    'decision-detail',
    blocker?.[1] ||
      (override
        ? 'The saved function returns true. The engine uses inverse marking and its ordinary exact checks. This recommendation is not a measured speedup.'
        : 'The saved function returns false. The engine keeps forward matching. This is a route recommendation, not a match result.'),
  )
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
  const state = policyState()
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
      'Bulk matching is available',
      `${anchors} anchors (need at least 32), ${witnesses} witnesses (need at least 1).`,
      anchors >= 32 && witnesses > 0,
    ),
    guard(
      'The current route is forward',
      `The existing count rule selects ${forward ? 'forward' : 'inverse'}. An existing inverse decision stays inverse.`,
      forward,
    ),
    guard(
      'The optional planner is eligible',
      `Planner ${enabled ? 'enabled' : 'disabled'}. ${attributes ? 'A supported filter is present.' : 'No attribute filter is present.'}`,
      enabled && attributes !== 0,
    ),
    guard(
      'The inputs are inside the saved range',
      `32–192 anchors, 80–768 witnesses, ratio 2.5–4. Current ratio: ${ratio.toFixed(2)}.`,
      inRange,
    ),
  ].join('')
  text(
    'policy-inputs',
    `${reached ? 'Called' : 'Not called'}: ${host}Policy(\n  ${anchors}, // anchors\n  ${witnesses}, // witnesses\n  ${attributes}, // attribute mask: card=2, warning=1\n  ${dense}, // dense: both selectors are plain class seeds\n  ${ratio.toFixed(3)}, // witnesses / anchors\n)${reached ? `\nReturns: ${override}` : ''}\n\nModel ID: ${hasRouteDecisionModelId}`,
  )
  showPolicyDecision(state, override)
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

function showSource(id: SourceId) {
  const source = sources[id]
  text('source-role', source.role)
  text('source-title', source.title)
  text('source-explanation', source.explanation)
  text('source-code', source.code)
  const link = element('source-link') as HTMLAnchorElement
  link.href = `https://github.com/dperini/nwsapi/blob/prerelease/3.0.0/${source.path}`
  document
    .querySelectorAll<HTMLButtonElement>('[data-file]')
    .forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset['file'] === id))
    })
}

let stageIndex = 0

function showStage(index: number) {
  stageIndex = index
  const stage = stages[index]!
  text(
    'pipeline-stage',
    `OFFLINE ${index < 4 ? 'DEVELOPMENT' : '→ RUNTIME'} · ${index + 1} / 5`,
  )
  text('pipeline-title', stage.title)
  text('pipeline-description', stage.description)
  text('pipeline-example', stage.example)
  document
    .querySelectorAll<HTMLButtonElement>('[data-stage]')
    .forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(Number(button.dataset['stage']) === index),
      )
    })
}

function jumpToSource(id: SourceId) {
  showSource(id)
  element('source').scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
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
}
let trainingRows: TrainingRow[] = []
let sampleIndex = 0

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
  text('sample-name', `${row.id} · ${sampleIndex + 1} of ${rows.length}`)
  element('sample-bars').innerHTML = ['Forward', 'Inverse']
    .map((name, index) => {
      const time = row.costsNs[index]!
      return `<div class="timing-row"><span>${name}</span><div class="timing-track"><div class="timing-fill" style="width:${(time / maximum) * 100}%"></div></div><span>${(time / 1000).toFixed(2)}µs</span></div>`
    })
    .join('')
  text(
    'sample-context',
    `Lower is faster. Archived median costs of the forward and inverse query variants for one ${row.host} fixture, recorded October 5, 2026. ${row.features[0]} anchor candidates, ${row.features[1]} witness candidates, attribute mask ${row.features[2]}. Family: ${row.family}. These are development examples, not a new measurement or independent qualification of the current runtime. Source: assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1/dataset/dataset.json.`,
  )
}

async function loadSamples() {
  if (trainingRows.length) {
    return
  }
  try {
    text('sample-name', 'Loading saved measurements…')
    const dataset =
      await import('../../../assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1/dataset/dataset.json')
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
  element('pipeline').innerHTML = stages
    .map(
      (stage, index) =>
        `<button type="button" data-stage="${index}" aria-pressed="${index === 0}"><span>0${index + 1} ${index === 4 ? 'RUNTIME' : 'OFFLINE'}</span>${stage.title.slice(3)}</button>`,
    )
    .join('')
  element('source-list').innerHTML = Object.entries(sources)
    .map(
      ([id, source]) =>
        `<button type="button" data-file="${id}" aria-pressed="false">${source.title}<small>${source.path}</small></button>`,
    )
    .join('')
  renderSearch()
  renderPolicy()
  showStage(0)
  showSource('match')
}

function handleClick(event: MouseEvent) {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    'button',
  )
  if (!target) {
    return
  }
  const data = target.dataset
  if (data['warning'] !== undefined) {
    const index = Number(data['warning'])
    warnings[index] = !warnings[index]
    renderSearch()
  }
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
}

initialize()
document.addEventListener('click', handleClick)
element('step-next').addEventListener('click', () => {
  step += 1
  showStep()
})
element('step-reset').addEventListener('click', () => {
  step = 0
  showStep()
})
document
  .querySelectorAll<HTMLInputElement>('input[name="route"]')
  .forEach(radio => {
    radio.addEventListener('change', () => {
      route = radio.value
      renderSearch()
    })
  })
element('policy-controls').addEventListener('input', renderPolicy)
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
