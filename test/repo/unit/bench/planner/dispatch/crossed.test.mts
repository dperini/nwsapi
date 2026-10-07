import assert from 'node:assert/strict'
import { test } from 'vitest'
import { crossedFixtures } from '../../../../../../scripts/repo/bench/planner/dispatch/crossed.mts'
import { split } from '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts'
import { checkFixtures } from './fixture-contract.mts'

test('crossed layouts preserve raw counts through every attribute mask', () => {
  const entries = crossedFixtures().filter(entry =>
    entry.family.startsWith('dispatch-crossed-'),
  )
  assert.equal(entries.length, 192)
  assert.equal(
    entries.filter(entry => split(entry.family) === 'evaluation').length,
    48,
  )
  assert.equal(
    entries.filter(entry => split(entry.family) === 'validation').length,
    48,
  )
  checkFixtures(entries)
})
