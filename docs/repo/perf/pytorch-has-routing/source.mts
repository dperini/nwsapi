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
      'Builds the route comparison experiment. Measurements are saved under assets/repo/bench/. Full-query timings must confirm that both routes actually ran.',
    code: collectorSource.split('\n').slice(0, 65).join('\n'),
  },
  train: {
    title: 'Train the numeric model',
    path: 'scripts/repo/pytorch/dispatch_train.py',
    role: 'Python · PyTorch',
    explanation:
      'The six encoded inputs feed a linear model or a small neural network. Training adjusts weights with AdamW. Validation selects the checkpoint and threshold.',
    code: excerpt(trainerSource, 'def weights(', '\ndef export('),
  },
  entry: {
    title: 'Start the pinned Python environment',
    path: 'scripts/repo/pytorch/dispatch-train.mts',
    role: 'TypeScript entry point',
    explanation:
      'This .mts script invokes the Python trainer through uv and the locked model-training environment. It does not implement PyTorch training in TypeScript.',
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
      'Reads the committed .generated.mjs files and model.txt. It parses JavaScript with @ultrathink/acorn.rs.wasm, gives helpers host-specific names, adds types, and formats one generated module.',
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
      'Checks runtime eligibility and asks the callback for an override. An error retains the forward route. Inverse matching checks witnesses, marks ancestors, and filters anchor candidates in order.',
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
      'Run a selector on a fixture DOM in Chromium and jsdom. Record forward and inverse costs plus facts available before executing the query. Measurements supply supervision: examples of which action costs less.',
    example:
      'query facts + forward cost + inverse cost\n→ one recorded example\n\nTiming units: ns per query\nSource: assets/repo/bench/',
    source: 'collect',
  },
  {
    title: '2. Train and validate',
    description:
      'Separate fixture families into training, validation, and evaluation groups. Adjust weights on training examples, then choose a model and threshold using validation and control cases. Uncertain pairs can receive zero weight. Regression risk and decision overhead matter.',
    example:
      'nn.Linear(6, hidden)\n→ nn.ReLU()\n→ nn.Linear(hidden, 1)\n\nOr: nn.Linear(6, 1)\nOptimizer: torch.optim.AdamW',
    source: 'train',
  },
  {
    title: '3. Save and export',
    description:
      'Save the selected weights as a PyTorch checkpoint. Repository Python code also writes the numeric JSON and JavaScript arithmetic. The .pt file is for development. The exported JavaScript is what the typed generator consumes.',
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
      'At query time, the engine collects facts and applies guards. If eligible, it calls the fixed JavaScript policy. The normal engine performs the chosen exact traversal. The weights remain unchanged.',
    example:
      'guards → policy(inputs) → boolean\n\ntrue: override forward with inverse\nfalse: keep current route\n\nExact DOM checks produce the matches.',
    source: 'match',
  },
]
