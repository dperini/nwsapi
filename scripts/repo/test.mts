import { testBudget } from './lib/test-budget.mts'
import { runLocalUnitReview } from './review/unit.mts'
import {
  runTestPhases,
  runnerArguments,
  testPhases,
  usesLocalUnitShards,
} from './test/phases.mts'

const isolateCleanCheckout = process.argv.includes(
  '--ci-isolate-clean-checkout',
)

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node scripts/repo/test.mts [unit|integration|all|upstream] [runner flags]
Default: unit. The all scope runs unit and integration, not upstream.
Runner flags are forwarded to Vitest or Playwright. Normal lane budgets remain enforced.
Examples:
  pnpm test
  node scripts/repo/run.mts scripts/repo/test.mts unit --reporter=verbose
  node scripts/repo/run.mts scripts/repo/test.mts integration --coverage
-h, --help displays this help without starting tests.`)
  process.exit(0)
}

const [tier = 'unit', ...forwardedArgs] = process.argv.slice(2)
const args = runnerArguments(forwardedArgs)
if (!['unit', 'integration', 'all', 'upstream'].includes(tier)) {
  throw new Error(
    'Usage: test.mts <unit|integration|all|upstream> [runner flags]',
  )
}
if (isolateCleanCheckout && tier !== 'integration') {
  throw new Error('--ci-isolate-clean-checkout requires the integration tier.')
}

async function runLane(
  lane: string,
  runner: string[],
  runnerArgs: string[],
  coverage: boolean,
) {
  const phasedArgs = runnerArgs.filter(
    argument => argument !== '--ci-isolate-clean-checkout',
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
    runLocalUnitReview()
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
