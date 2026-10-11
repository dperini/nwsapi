import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

import {
  runTestPhases,
  testPhases,
  usesLocalUnitShards,
} from '../../../../scripts/repo/test/phases.mts'
import type { runBudgeted } from '../../../../scripts/repo/lib/test-budget.mts'

const cleanCheckout = 'test/repo/integration/typecheck-clean.test.mts'

test('only argument-free noncoverage unit runs use local shards', () => {
  assert.equal(usesLocalUnitShards('unit', [], false), true)
  assert.equal(usesLocalUnitShards('unit', [], true), false)
  assert.equal(
    usesLocalUnitShards('unit', ['--reporter=verbose'], false),
    false,
  )
  assert.equal(usesLocalUnitShards('integration', [], false), false)
})

test('the isolated CI integration schedule runs the clean checkout alone', () => {
  const phases = testPhases('integration', ['--reporter=json'], true)

  assert.deepEqual(phases, [
    {
      args: ['--reporter=json', cleanCheckout],
      label: 'integration clean-checkout',
    },
    {
      args: ['--reporter=json', `--exclude=${cleanCheckout}`],
      label: 'integration suite',
    },
  ])
})

test('ordinary and focused integration plans keep their arguments', () => {
  const args = ['test/repo/integration/fixture.test.mts', '--reporter=json']
  assert.deepEqual(testPhases('integration', args, false), [
    { args, label: 'integration' },
  ])
  assert.deepEqual(testPhases('unit', args, true), [{ args, label: 'unit' }])
})

test('split phases share the original lane budget', async () => {
  const budgets: number[] = []
  const time = [0, 5, 35]
  const run = async (_args: string[], budget: number) => {
    budgets.push(budget)
    return 0
  }

  const result = await runTestPhases({
    phases: testPhases('integration', [], true),
    runner: ['vitest'],
    budgetMs: 100,
    env: {},
    run: run as typeof runBudgeted,
    now: () => time.shift() ?? 100,
  })

  assert.equal(result, 0)
  assert.deepEqual(budgets, [95, 65])
})

test('a failed phase prevents later test groups from running', async () => {
  const run = vi.fn(async () => 1)
  const result = await runTestPhases({
    phases: testPhases('integration', [], true),
    runner: ['vitest'],
    budgetMs: 100,
    env: {},
    run: run as typeof runBudgeted,
    now: () => 0,
  })

  assert.equal(result, 1)
  assert.equal(run.mock.calls.length, 1)
})

test('expired shared budgets stop before starting another test group', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const run = vi.fn(async () => 0)
  const time = [0, 101]
  const result = await runTestPhases({
    phases: testPhases('integration', [], true),
    runner: ['vitest'],
    budgetMs: 100,
    env: {},
    run: run as typeof runBudgeted,
    now: () => time.shift() ?? 101,
  })

  assert.equal(result, 1)
  assert.equal(run.mock.calls.length, 0)
  error.mockRestore()
})
