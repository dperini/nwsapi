import { runBudgeted, TEST_BUDGET_MS } from './lib/test-budget.mts'

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
    TEST_BUDGET_MS[lane as keyof typeof TEST_BUDGET_MS],
    lane,
    { ...process.env, NWSAPI_TEST_TIER: lane },
  )
  if (code) {
    process.exitCode = code
    break
  }
}
