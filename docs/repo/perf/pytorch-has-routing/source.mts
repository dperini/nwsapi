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
      'Measures both search routes and saves the results under assets/repo/bench/. Complete query timings must confirm that each route ran as intended.',
    code: collectorSource.split('\n').slice(0, 65).join('\n'),
  },
  train: {
    title: 'Train the model',
    path: 'scripts/repo/pytorch/dispatch_train.py',
    role: 'Python · PyTorch',
    explanation:
      'Trains a linear model or small neural network from six inputs. AdamW adjusts the weights. Validation selects the saved model and threshold.',
    code: excerpt(trainerSource, 'def weights(', '\ndef export('),
  },
  entry: {
    title: 'Start the pinned Python environment',
    path: 'scripts/repo/pytorch/dispatch-train.mts',
    role: 'TypeScript entry point',
    explanation:
      'Starts the Python trainer through uv using the pinned training environment. PyTorch training runs in Python.',
    code: entrySource,
  },
  export: {
    title: 'Write the JavaScript export',
    path: 'scripts/repo/pytorch/dispatch_train.py',
    role: 'Repository exporter',
    explanation:
      'The exporter reads learned tensors and emits guarded scalar arithmetic. Input normalization is folded into the exported weights and biases.',
    code: excerpt(trainerSource, 'def export(', '\ndef '),
  },
  generate: {
    title: 'Generate the typed runtime module',
    path: 'scripts/repo/gen/has-route-decision.mts',
    role: 'AST-based generation',
    explanation:
      'Reads the committed JavaScript exports and model.txt. Uses @ultrathink/acorn.rs.wasm to parse the code, rename helpers for each host, add types, and format the runtime module.',
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
      'This is the same module imported by the explorer above. The Chromium function has four hidden units and a saved threshold. The jsdom export uses linear arithmetic.',
    code: generatedSource,
  },
  policy: {
    title: 'Select the host policy',
    path: 'src/core/select/has/policy.mts',
    role: 'Static runtime import',
    explanation:
      'Imports both generated functions directly and selects Chromium or jsdom. The build bundles them into the engine. There is no latest-file lookup.',
    code: policySource,
  },
  match: {
    title: 'Guard and execute the route',
    path: 'src/core/select/has/match.mts',
    role: 'Exact selector engine',
    explanation:
      'Checks eligibility and calls the model to decide whether to switch routes. A callback error keeps the forward route. Inverse matching checks witnesses, marks ancestors, and filters anchors in document order.',
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
      'Run both search routes on fixture DOMs in Chromium and jsdom. Record their timings and the inputs available before searching. These examples teach the model which route costs less.',
    example:
      'query facts + forward cost + inverse cost\n→ one recorded example\n\nTiming units: ns per query\nSource: assets/repo/bench/',
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
      'The engine collects query inputs and checks eligibility. For eligible queries, it calls the saved JavaScript function and searches using the chosen route. The weights stay fixed.',
    example:
      'guards → policy(inputs) → boolean\n\ntrue: override forward with inverse\nfalse: keep current route\n\nExact DOM checks produce the matches.',
    source: 'match',
  },
]
