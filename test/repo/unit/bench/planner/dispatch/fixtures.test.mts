import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  fixtures,
  split,
} from '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts'
import { checkFixtures } from './fixture-contract.mts'

test('dispatch templates preserve observed counts and keep training families separate', () => {
  const entries = fixtures().filter(entry =>
    entry.family.startsWith('dispatch-template-'),
  )
  assert.equal(entries.length, 80)
  checkFixtures(entries)
  assert.equal(split('development-control'), 'development')
  assert.equal(split('dispatch-template-0'), 'train')
  assert.equal(split('dispatch-template-6'), 'validation')
  assert.equal(split('dispatch-template-8'), 'evaluation')
  assert.equal(split('dispatch-expanded-0'), 'train')
  assert.equal(split('dispatch-expanded-4'), 'validation')
  assert.equal(split('dispatch-expanded-6'), 'evaluation')
  assert.equal(split('dispatch-crossed-0'), 'train')
  assert.equal(split('dispatch-crossed-4'), 'validation')
  assert.equal(split('dispatch-crossed-6'), 'evaluation')
})
