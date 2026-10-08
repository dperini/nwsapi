/// <reference types="vite/client" />
const files = import.meta.glob<string>(
  [
    '../../../../src/core/select/has/*.mts',
    '../../../../scripts/repo/pytorch/dispatch_train.py',
    '../../../../scripts/repo/pytorch/dispatch-train.mts',
    '../../../../scripts/repo/gen/has-route-decision.mts',
    '../../../../scripts/repo/bench/planner/dispatch/collect.mts',
  ],
  { query: '?raw', import: 'default', eager: true },
)

function readSource(path: string): string {
  const source = files[`../../../../${path}`]
  if (source === undefined) {
    throw new Error(`Missing source excerpt: ${path}`)
  }
  return source
}

const matchSource = readSource('src/core/select/has/match.mts')
const policySource = readSource('src/core/select/has/policy.mts')
const generatedSource = readSource(
  'src/core/select/has/route-decision.generated.mts',
)
const trainerSource = readSource('scripts/repo/pytorch/dispatch_train.py')
const entrySource = readSource('scripts/repo/pytorch/dispatch-train.mts')
const generatorSource = readSource('scripts/repo/gen/has-route-decision.mts')
const collectorSource = readSource(
  'scripts/repo/bench/planner/dispatch/collect.mts',
)

function excerpt(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  return source.slice(from, to < 0 ? undefined : to).trim()
}

export const sources = {
  collect: {
    title: 'Measure both routes',
    path: 'scripts/repo/bench/planner/dispatch/collect.mts',
    role: 'Benchmark collection',
    explanation:
      'Runs both routes on the same fixture DOMs and saves timings under assets/repo/bench/. Instrumentation checks that each variant takes the intended route.',
    code: excerpt(
      collectorSource,
      'export async function collect(',
      '\n  if (resume)',
    ),
  },
  train: {
    title: 'Train the model',
    path: 'scripts/repo/pytorch/dispatch_train.py',
    role: 'Python · PyTorch',
    explanation:
      'Trains a linear function or small neural network from six query facts. The loss weights uncertain results and slowdown risks. AdamW adjusts the learned numbers. Validation selects a model and threshold.',
    code: excerpt(trainerSource, 'def weights(', '\ndef export('),
  },
  entry: {
    title: 'Start the pinned Python environment',
    path: 'scripts/repo/pytorch/dispatch-train.mts',
    role: 'TypeScript entry point',
    explanation:
      'Uses uv to start the Python trainer in the pinned environment. This TypeScript file launches training. PyTorch itself runs in Python.',
    code: entrySource,
  },
  export: {
    title: 'Write the JavaScript export',
    path: 'scripts/repo/pytorch/dispatch_train.py',
    role: 'Repository exporter',
    explanation:
      'Turns the learned arrays of numbers into JavaScript arithmetic and input checks. It folds normalization into the weights and biases, so the runtime needs no separate normalization pass.',
    code: excerpt(trainerSource, 'def export(', '\ndef '),
  },
  generate: {
    title: 'Generate the typed runtime module',
    path: 'scripts/repo/gen/has-route-decision.mts',
    role: 'TypeScript generation',
    explanation:
      'Reads the committed JavaScript exports and model.txt. The pinned @ultrathink/acorn.rs.wasm parser builds a syntax tree. The generator uses it to rename host helpers, add types, and write the runtime module.',
    code: excerpt(
      generatorSource,
      'function modelSource(',
      '\nexport async function renderHasRouteDecision',
    ),
  },
  generated: {
    title: 'Run the saved weights',
    path: 'src/core/select/has/route-decision.generated.mts',
    role: 'Actual generated policy',
    explanation:
      'The explorer and nwsapi import this same module. Chromium uses four intermediate units and a saved threshold. The jsdom function uses a single linear score.',
    code: generatedSource,
  },
  policy: {
    title: 'Select the host policy',
    path: 'src/core/select/has/policy.mts',
    role: 'Static runtime import',
    explanation:
      'Imports both generated functions directly and selects Chromium or jsdom. The build bundles them into nwsapi. There is no latest-file lookup.',
    code: policySource,
  },
  match: {
    title: 'Guard and execute the route',
    path: 'src/core/select/has/match.mts',
    role: 'Exact matching in nwsapi',
    explanation:
      'Checks eligibility before asking the model whether to replace downward search (forward). A callback error keeps that route. Upward search (inverse) checks witnesses, marks ancestors, then filters anchors in document order.',
    code: matchSource,
  },
}
export type SourceId = keyof typeof sources

export const stages: Array<{
  title: string
  description: string
  example: string
  source: SourceId
}> = [
  {
    title: '1. Measure both routes',
    description:
      'Run both routes on the same fixture DOMs. Save their timings and the query facts available before searching. These recorded examples become the training data.',
    example:
      'query facts + downward cost + upward cost\n→ one recorded example\n\nTiming units: ns per query\nSource: assets/repo/bench/',
    source: 'collect',
  },
  {
    title: '2. Train and validate',
    description:
      'Split fixture families into training, validation, and evaluation groups. Train the weights, then select a model and threshold using validation. Account for uncertain timings, slowdowns, and model overhead.',
    example:
      'nn.Linear(6, hidden)\n→ nn.ReLU()\n→ nn.Linear(hidden, 1)\n\nOr: nn.Linear(6, 1)\nOptimizer: torch.optim.AdamW',
    source: 'train',
  },
  {
    title: '3. Save and export',
    description:
      'Save the weights in a PyTorch checkpoint. The Python exporter also writes JSON and JavaScript. Development tools use the checkpoint. The TypeScript generator reads the JavaScript export.',
    example:
      'assets/repo/pytorch/model/\n  chromium.generated.pt\n  chromium-weights.generated.json\n  chromium.generated.mjs\n  (plus jsdom equivalents)',
    source: 'export',
  },
  {
    title: '4. Generate and build',
    description:
      'The repository generator parses the saved JavaScript exports, adds types and host-specific function names, and writes route-decision.generated.mts. The normal build includes that module in dist/nwsapi.js.',
    example:
      'pnpm run gen:has-route-decision\npnpm run build\n\nSaved export → typed module → bundle\nNo retraining required here.',
    source: 'generate',
  },
  {
    title: '5. Run exact queries',
    description:
      'nwsapi first chooses a route using its count rule. An eligible downward search can ask the saved function for an override. The selected route checks exact matches. The weights stay fixed.',
    example:
      'guards → policy(inputs) → boolean\n\ntrue: search up (inverse)\nfalse: keep searching down (forward)\n\nExact DOM checks produce the matches.',
    source: 'match',
  },
]
