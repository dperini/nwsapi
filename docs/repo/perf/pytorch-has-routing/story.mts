import {
  chromiumPolicy,
  jsdomPolicy,
} from '../../../../src/core/select/has/route-decision.generated.mts'
import { element, text } from './ui.mts'

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

export function renderStory(index: number, fallback: string) {
  const query = selectedQuery()
  text('story-progress', `${index + 1} / 5`)
  ;(element('story-back') as HTMLButtonElement).disabled = index === 0
  ;(element('story-next') as HTMLButtonElement).disabled = index === 4
  text(
    'story-next',
    [
      'Next: train the model',
      'Next: save the weights',
      'Next: build the engine',
      'Next: run the query',
      'Story complete',
    ][index]!,
  )
  if (!query) {
    text(
      'story-explanation',
      failed
        ? 'Recorded measurements could not load. The source walkthrough is still available.'
        : 'Loading the recorded query…',
    )
    return fallback
  }
  const [anchors, witnesses, mask, ratio] = query.features as [
    number,
    number,
    number,
    number,
  ]
  const chosen = selector(mask)
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
    `Start with ${chosen}. On this fixture, the engine finds ${anchors} card candidates and ${witnesses} witness candidates. Measure both routes on the same DOM before training.`,
    `Inverse costs ${microseconds(query.costsNs[1]! + budget)} after adding the trainer’s ${budget}ns model budget. The existing forward route costs ${microseconds(query.baselineCostNs)}. This row’s timing target is ${target ? 'switch to inverse' : 'keep forward'}. Many examples train the same weights.`,
    'PyTorch saves the learned weights. The repository exporter turns those numbers into JavaScript arithmetic. This selector is an example used to train a shared function, not a separate model file.',
    'The generator adds TypeScript types to the saved JavaScript. The build bundles the function into the engine. Your selector and DOM stay ordinary inputs to the selector API.',
    `For this row’s inputs, the saved ${query.host} model returns ${override}. The engine would ${override ? 'switch to inverse' : 'keep forward'} after checking eligibility. The ${route} route still checks the selector and returns exact matches in document order.`,
  ]
  text('story-explanation', explanations[index]!)
  text(
    'story-context',
    `Recorded ${query.host} fixture ${query.id}, October 5, 2026. Timings are archived medians, not a new benchmark. This row is one training example. Repeated samples, uncertainty, and slowdown penalties also affect training. The final recommendation calls the saved model; it is not a newly trained prediction.`,
  )
  const examples = [
    `selector = '${chosen}'\n\nanchors = ${anchors}\nwitnesses = ${witnesses}\nratio = ${ratio}\n\nForward: ${microseconds(query.costsNs[0]!)}\nInverse: ${microseconds(query.costsNs[1]!)}`,
    `query inputs → model → prediction\nmeasured route costs → training target\n\nThis row’s target: ${target ? 'inverse (1)' : 'forward (0)'}\n\nloss → AdamW → updated weights\nRepeat across the training examples.`,
    `assets/repo/pytorch/model/\n  ${query.host}.generated.pt\n  ${query.host}-weights.generated.json\n  ${query.host}.generated.mjs\n\nSaved weights → JavaScript arithmetic`,
    `pnpm run gen:has-route-decision\npnpm run build\n\nSaved export\n→ route-decision.generated.mts\n→ dist/nwsapi.js`,
    `${query.host}Policy(${anchors}, ${witnesses}, ${mask}, ${Number(query.routeFacts.denseInverse)}, ${ratio})\n→ ${override}\n→ ${route} route\n\nengine.select('${chosen}', document)\n→ exact matching cards`,
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
