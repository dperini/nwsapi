import { expect, test } from 'vitest'
import {
  runBudgeted,
  TEST_BUDGET_MS,
} from '../../../../scripts/repo/lib/test-budget.mts'

test('test tiers keep a strict unit ceiling and a separate WPT allowance', () => {
  expect(TEST_BUDGET_MS.unit).toBe(10_000)
  expect(TEST_BUDGET_MS.integration).toBe(60_000)
  expect(TEST_BUDGET_MS.upstream).toBe(600_000)
})

test('the watchdog fails a synchronous hang and preserves child failures', async () => {
  expect(
    await runBudgeted(['-e', 'while (true) {}'], 300, 'intentional timeout'),
  ).toBe(1)
  expect(
    await runBudgeted(['-e', 'process.exit(7)'], 2000, 'intentional failure'),
  ).toBe(7)
  expect(await runBudgeted(['-e', ''], 2000, 'successful child')).toBe(0)
})
