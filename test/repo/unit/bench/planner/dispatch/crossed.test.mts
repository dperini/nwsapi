import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { crossedFixtures } from '../../../../../../scripts/repo/bench/planner/dispatch/crossed.mts'
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

test('crossed layouts preserve raw counts through every attribute mask', () => {
  const all = crossedFixtures()
  assert.equal(all[0], control)
  const entries = all.filter(entry =>
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
