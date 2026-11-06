import { object } from '@optique/core/constructs'
import { message as optiqueMessage } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { argument, flag, passThrough } from '@optique/core/primitives'
import { choice } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli, runForwardingCli } from './lib/cli/parser.mts'
import { testBudget } from './lib/test-budget.mts'
import { runLocalUnitReview } from './review/unit.mts'
import {
  runTestPhases,
  runnerArguments,
  testPhases,
  usesLocalUnitShards,
} from './test/phases.mts'

const cliArgs = process.argv.slice(2)
if (cliArgs.some(cliArg => cliArg === '-h' || cliArg === '--help')) {
  runForwardingCli(
    'test',
    cliArgs,
    optiqueMessage`Run unit, integration, all, or upstream tests.`,
  )
  process.exit(0)
}

const options = runCli(
  object({
    tier: withDefault(
      argument(choice(['unit', 'integration', 'all', 'upstream'])),
      'unit',
    ),
    ciIsolateCleanCheckout: withDefault(
      flag('--ci-isolate-clean-checkout'),
      false,
    ),
    json: withDefault(flag('--json'), false),
    describe: withDefault(flag('--describe'), false),
    forwardedArgs: passThrough({ format: 'greedy' }),
  }),
  'test',
  cliArgs,
  {
    brief: optiqueMessage`Run unit, integration, all, or upstream tests.`,
    footer: optiqueMessage`Use --json for structured runner output or --describe for command details. Runner flags pass through to Vitest or Playwright. Normal lane budgets remain enforced. The all scope runs unit and integration, not upstream.`,
  },
)
if (options === HELP_SHOWN) {
  process.exit(0)
}

const { tier, ciIsolateCleanCheckout: isolateCleanCheckout } = options
if (options.describe) {
  const description = {
    schemaVersion: 1,
    type: 'command',
    name: 'test',
    description: 'Run repository tests with the standard lane budgets.',
    arguments: ['unit', 'integration', 'all', 'upstream'],
    options: ['--describe', '--json', '--ci-isolate-clean-checkout'],
    mutates: false,
  }
  console.log(
    options.json ? JSON.stringify(description) : description.description,
  )
  process.exit(0)
}
const args = runnerArguments([
  ...options.forwardedArgs,
  ...(options.json ? ['--reporter=json'] : []),
])
if (isolateCleanCheckout && tier !== 'integration') {
  throw new Error('--ci-isolate-clean-checkout requires the integration tier.')
}

export async function runLane(
  lane: string,
  runner: string[],
  runnerArgs: string[],
  coverage: boolean,
) {
  const phasedArgs = runnerArgs.filter(
    item => item !== '--ci-isolate-clean-checkout',
  )
  const phases = testPhases(
    lane,
    [
      ...phasedArgs,
      ...(coverage ? [`--coverage.reportsDirectory=coverage/${lane}`] : []),
    ],
    isolateCleanCheckout && !coverage,
  )
  return runTestPhases({
    phases,
    runner,
    budgetMs: testBudget(lane, coverage),
    env: { ...process.env, NWSAPI_TEST_TIER: lane },
  })
}

for (const lane of tier === 'all' ? ['unit', 'integration'] : [tier]) {
  const coverage = args.includes('--coverage')
  if (usesLocalUnitShards(lane, args, coverage)) {
    await runLocalUnitReview()
    continue
  }
  const upstream = lane === 'upstream'
  const runner = upstream
    ? [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        '.config/playwright.config.mts',
      ]
    : [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        '.config/repo/vitest.config.mts',
      ]
  const code = await runLane(lane, runner, args, !upstream && coverage)
  if (code) {
    process.exitCode = code
    break
  }
}
