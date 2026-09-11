import { expect, test } from 'vitest'
import {
  COVERAGE_TEST_BUDGET_MS,
  TEST_BUDGET_MS,
  testBudget,
} from '../../../../scripts/repo/lib/test-budget.mts'

test('coverage gets instrumentation headroom without changing normal lanes', () => {
  expect(testBudget('unit', false)).toBe(TEST_BUDGET_MS.unit)
  expect(testBudget('unit', true)).toBe(COVERAGE_TEST_BUDGET_MS.unit)
  expect(testBudget('integration', false)).toBe(TEST_BUDGET_MS.integration)
  expect(testBudget('integration', true)).toBe(
    COVERAGE_TEST_BUDGET_MS.integration,
  )
  expect(testBudget('upstream', true)).toBe(TEST_BUDGET_MS.upstream)
})
