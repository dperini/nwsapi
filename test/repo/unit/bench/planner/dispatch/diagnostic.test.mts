import assert from 'node:assert/strict'
import { test } from 'vitest'
import { diagnosticFixtures } from '../../../../../../scripts/repo/bench/planner/dispatch/diagnostic.mts'
import { checkFixtures } from './fixture-contract.mts'

test('diagnostic layouts preserve raw feature counts and remain outside training', () => {
  const entries = diagnosticFixtures()
  assert.equal(entries.length, 96)
  assert.ok(entries.every(entry => entry.split === 'holdout'))
  checkFixtures(entries)
})
