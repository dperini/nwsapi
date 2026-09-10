import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { options } from '../../../../../scripts/repo/bench/compare/options.mts'

const args = [
  '--baseline',
  path.join(os.tmpdir(), 'before.cjs'),
  '--output',
  path.join(os.tmpdir(), 'report.json'),
]
test('comparison options reject invalid measurement budgets and fixture sizes', () => {
  for (const pair of [
    ['--groups', '1'],
    ['--matches', '257'],
    ['--matches', ''],
    ['--rounds', '0'],
    ['--batch', 'Infinity'],
    ['--milliseconds', '-1'],
    ['--mode', 'both'],
    ['--layout', 'unknown'],
    ['--scenario', 'unknown'],
  ]) {
    assert.throws(() => options([...args, ...pair]))
  }
  const result = options([
    ...args,
    '--matches',
    '0,1,16,256',
    '--mode',
    'memory',
  ])
  assert.deepEqual(result.counts, [0, 1, 16, 256])
  assert.equal(result.mode, 'memory')
})
