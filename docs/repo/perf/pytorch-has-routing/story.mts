import {
  chromiumPolicy,
  jsdomPolicy,
} from '../../../../src/core/select/has/route-decision.generated.mts'
import { element, text, writeUnitText } from './ui.mts'
import { highlightSelector } from './selector.mts'
import { currentLocale } from './locale.mts'
import { localizeText } from './locale-content.mts'
import { routeDirections } from './dom.mts'
import type { StoryReadout } from './story-readout.mts'

type RecordedQuery = {
  id: string
  host: string
  family: string
  features: number[]
  costsNs: number[]
  baselineCostNs: number
  baselineRoute: string
  decisionReached: boolean
  routeFacts: { denseInverse: boolean }
}

let rows: RecordedQuery[] = []
let budget = 0
let failed = false

function selectedQuery() {
  const host = (element('story-host') as HTMLSelectElement).value
  const mask = Number((element('story-selector') as HTMLSelectElement).value)
  return rows.find(row => row.host === host && row.features[2] === mask)
}

function selector(mask: number) {
  return `.card${mask & 2 ? '[data-ok="1"]' : ''}:has(.witness${mask & 1 ? '[data-ok="1"]' : ''})`
}

function microseconds(value: number) {
  return `${(value / 1000).toFixed(2)}µs`
}

function explain(source: string, chosen?: string) {
  const node = element('story-explanation')
  node.setAttribute('data-locale-content', '')
  const localized = localizeText(source, currentLocale())
  const start = chosen ? localized.indexOf(chosen) : -1
  if (!chosen || start < 0) {
    writeUnitText(node, localized)
    return
  }
  const code = document.createElement('code')
  code.className = 'selector-code'
  highlightSelector(code, chosen)
  node.replaceChildren(
    localized.slice(0, start),
    code,
    localized.slice(start + chosen.length),
  )
}

export function renderStory(index: number, fallback: string): StoryReadout {
  const query = selectedQuery()
  element('pipeline-description').hidden = query !== undefined
  ;(element('story-back') as HTMLButtonElement).disabled = index === 0
  ;(element('story-next') as HTMLButtonElement).disabled = index === 4
  if (!query) {
    explain(
      failed
        ? 'Recorded measurements could not load. The source walkthrough is still available.'
        : 'Loading the recorded query…',
    )
    return { note: fallback }
  }
  const [anchors, witnesses, mask, ratio] = query.features as [
    number,
    number,
    number,
    number,
  ]
  const chosen = selector(mask)
  const host = query.host === 'chromium' ? 'Chromium' : query.host
  const target = query.costsNs[1]! + budget < query.baselineCostNs
  const policy = query.host === 'chromium' ? chromiumPolicy : jsdomPolicy
  const override = policy(
    anchors,
    witnesses,
    mask,
    Number(query.routeFacts.denseInverse),
    ratio,
  )
  const route = override ? 'inverse' : 'forward'
  const explanations = [
    `Start with ${chosen}. This recorded fixture has ${anchors} card candidates and ${witnesses} witness candidates. Before training, the benchmark measured both routes on the same DOM.`,
    `The recorded upward search plus the trainer’s ${budget}ns model budget costs ${microseconds(query.costsNs[1]! + budget)}. Downward search costs ${microseconds(query.baselineCostNs)}. A simple comparison favors ${target ? 'switching to upward search' : 'keeping the downward search'}. Training also considers uncertainty and slowdown penalties across many examples.`,
    'PyTorch saves the learned weights in a checkpoint. The repository exporter writes JavaScript arithmetic using those weights. Many selectors share this function. There is no model file for each selector.',
    'The generator creates a typed module from the saved JavaScript export. The build bundles that module into nwsapi. Neither Python nor a training run is needed to execute a query.',
    `The committed ${host} model returns ${override} for these inputs. An eligible query would ${override ? 'switch to upward search' : 'keep searching down'}. The ${routeDirections[route]}ward search still checks the selector exactly and returns matches in document order. This recommendation could be slower on another DOM with the same inputs.`,
  ]
  explain(explanations[index]!, index === 0 ? chosen : undefined)
  text(
    'story-context',
    `Source: ${host} fixture ${query.id}, recorded October 5, 2026. Timings are archived medians. The steps explain the training process without retraining the model or running a benchmark. The final step calls the committed function with this example’s inputs.`,
  )
  const examples: StoryReadout[] = [
    {
      selector: chosen,
      facts: [
        ['Cards', String(anchors)],
        ['Witnesses', String(witnesses)],
        ['Witnesses per card', String(ratio)],
        ['Search down', microseconds(query.costsNs[0]!)],
        ['Search up', microseconds(query.costsNs[1]!)],
      ],
    },
    {
      facts: [
        ['Timing target', target ? 'Search up' : 'Search down'],
        ['Search up + model budget', microseconds(query.costsNs[1]! + budget)],
        ['Search down', microseconds(query.baselineCostNs)],
        ['Model budget', `${budget}ns`],
      ],
      note: 'Measured costs guide training. AdamW adjusts the weights across many examples.',
    },
    {
      facts: [
        ['Checkpoint', `${query.host}.generated.pt`],
        ['Weights', `${query.host}-weights.generated.json`],
        ['JavaScript', `${query.host}.generated.mjs`],
      ],
      note: 'Saved under assets/repo/pytorch/model/.',
    },
    {
      code: 'pnpm run gen:has-route-decision\npnpm run build',
      facts: [
        ['Generated module', 'route-decision.generated.mts'],
        ['Bundle', 'dist/nwsapi.js'],
      ],
    },
    {
      selector: chosen,
      code: `const useUpward = ${query.host}Policy(${anchors}, ${witnesses}, ${mask}, ${Number(query.routeFacts.denseInverse)}, ${ratio})`,
      facts: [
        ['Model decision', String(override)],
        ['Recommended route', `Search ${routeDirections[route]}`],
        ['Results', 'Exact matching cards'],
      ],
    },
  ]
  return examples[index]!
}

export async function initializeStory(refresh: () => void) {
  try {
    const [dataset, evaluation] = await Promise.all([
      import('../../../../assets/repo/bench/planner-dispatch-crossed-2026-10-05-r1/dataset/dataset.json'),
      import('../../../../assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1/evaluation.json'),
    ])
    budget = evaluation.default.decisionBudgetNs
    rows = (dataset.default.rows as RecordedQuery[]).filter(
      row =>
        row.family === 'dispatch-crossed-0' &&
        row.decisionReached &&
        row.baselineRoute === 'forward',
    )
  } catch {
    failed = true
  }
  refresh()
}
