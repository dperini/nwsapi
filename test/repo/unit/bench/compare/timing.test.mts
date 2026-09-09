import assert from 'node:assert/strict'
import { test } from 'vitest'
import { compareTiming } from '../../../../../scripts/repo/bench/compare/timing.mts'

test('mitata comparisons record per-query samples and propagate query errors', async () => {
  let calls = 0
  const [rounds] = await compareTiming([() => ++calls], {
    rounds: 1,
    milliseconds: 1,
    batch: 16,
  })
  const result = rounds![0]!
  assert.ok(result.samplesNs.length >= 12)
  assert.equal(result.calls, result.samplesNs.length * 16)
  assert.ok(calls >= result.calls)
  assert.ok(result.p50Ns >= 0)
  assert.ok(result.p99Ns >= result.p50Ns)
  await assert.rejects(
    compareTiming(
      [
        () => {
          throw new Error('broken query')
        },
      ],
      { rounds: 1, milliseconds: 1, batch: 1 },
    ),
    /broken query/,
  )
})
