import { runBudgeted, testBudget } from './lib/test-budget.mts'

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

const [tier = 'unit', ...args] = process.argv.slice(2)
if (!['unit', 'integration', 'all', 'upstream'].includes(tier)) {
  throw new Error(
    'Usage: test.mts <unit|integration|all|upstream> [runner flags]',
  )
}
for (const lane of tier === 'all' ? ['unit', 'integration'] : [tier]) {
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
  const coverage = args.includes('--coverage')
  const code = await runBudgeted(
    [
      ...runner,
      ...args,
      ...(!upstream && coverage
        ? [`--coverage.reportsDirectory=coverage/${lane}`]
        : []),
    ],
    testBudget(lane, coverage),
    lane,
    { ...process.env, NWSAPI_TEST_TIER: lane },
  )
  if (code) {
    process.exitCode = code
    break
  }
}
