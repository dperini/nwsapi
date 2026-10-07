import assert from 'node:assert/strict'
import { test } from 'vitest'
import { expandedFixtures } from '../../../../../../scripts/repo/bench/planner/dispatch/expanded.mts'
import { split } from '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts'
import { checkFixtures } from './fixture-contract.mts'

test('expanded layouts preserve feature counts and keep evaluation families separate', () => {
  const entries = expandedFixtures().filter(entry =>
    entry.family.startsWith('dispatch-expanded-'),
  )
  assert.equal(entries.length, 128)
  assert.equal(
    entries.filter(entry => split(entry.family) === 'evaluation').length,
    32,
  )
  assert.equal(
    entries.filter(entry => split(entry.family) === 'validation').length,
    32,
  )
  checkFixtures(entries)
})
