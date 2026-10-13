import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { expandedFixtures } from '../../../../../../scripts/repo/bench/planner/dispatch/expanded.mts'
import { split } from '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts'
import { checkFixtures } from './fixture-contract.mts'

const control = vi.hoisted(() => ({
  id: 'control',
  family: 'control',
  split: 'train' as const,
  html: '<p></p>',
  selector: 'p',
  tags: [],
}))

vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/fixtures.mts',
  () => ({
    fixtures: () => [control],
  }),
)

test('expanded layouts preserve feature counts and keep evaluation families separate', () => {
  const all = expandedFixtures()
  assert.equal(all[0], control)
  const entries = all.filter(entry =>
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
