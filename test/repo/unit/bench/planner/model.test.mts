import assert from 'node:assert/strict'
import { compileFunction } from 'node:vm'
import { test } from 'vitest'
import {
  decide,
  expression,
  guardedExpression,
  train,
} from '../../../../../scripts/repo/bench/planner/model.mts'
import type { Observation } from '../../../../../scripts/repo/bench/planner/model.mts'

test('cost training separates workloads only when both children have evidence', () => {
  const rows: Observation[] = Array.from({ length: 24 }, (_, index) => ({
    features: [index + 1, 100, 2, (index + 1) / 100],
    costs: index < 12 ? [1, 10] : [10, 1],
  }))
  const tree = train(rows)
  assert.equal(decide(tree, [1, 100, 2, 0.01]), false)
  assert.equal(decide(tree, [24, 100, 2, 0.24]), true)
  const exported = compileFunction(`return ${expression(tree)}`, [
    'count',
    'total',
    'arity',
  ]) as (count: number, total: number, arity: number) => boolean
  assert.equal(exported(1, 100, 2), false)
  assert.equal(exported(24, 100, 2), true)
  assert.deepEqual(train(rows, 0), { broad: false })
  assert.deepEqual(train(rows.slice(0, 5)), { broad: false })
  assert.deepEqual(train(rows.map(row => ({ ...row, costs: [1, 2] }))), {
    broad: false,
  })
})

test('exported bounded expressions retain the count rule outside the training domain', () => {
  const source = guardedExpression(
    { broad: true },
    {
      min: [1, 10, 2, 0.1],
      max: [10, 100, 4, 0.5],
      arities: [2, 4],
    },
  )
  const choose = compileFunction(`return ${source}`, [
    'count',
    'total',
    'arity',
  ]) as (count: number, total: number, arity: number) => boolean
  assert.equal(choose(10, 100, 2), true)
  assert.equal(choose(10, 100, 3), false)
  assert.equal(choose(0, 100, 2), false)
  assert.equal(choose(90, 100, 2), true)
  assert.equal(expression({ broad: false }), 'false')
})
