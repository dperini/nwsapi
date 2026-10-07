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
          throw Object.assign(new Error('query'), { code: 'QUERY_FAILED' })
        },
      ],
      { rounds: 1, milliseconds: 1, batch: 1 },
    ),
    { code: 'QUERY_FAILED' },
  )
})

test('heap comparisons retain per-call allocation summaries and rotate multiple query rounds', async () => {
  let heap = 0
  let collections = 0
  const queries = [() => 1, () => 2]
  const results = await compareTiming(
    queries,
    { rounds: 2, milliseconds: 1, batch: 4 },
    {
      read: () => ++heap,
      gc: () => {
        collections += 1
      },
    },
  )
  assert.equal(results.length, 2)
  assert.ok(collections > 0)
  for (let index = 0, length = results.length; index < length; index += 1) {
    assert.deepEqual(
      results[index]!.map(round => round.round),
      [0, 1],
    )
    const rounds = results[index]!
    for (let round = 0, count = rounds.length; round < count; round += 1) {
      assert.equal(rounds[round]!.samplesNs.length, 12)
      assert.equal(rounds[round]!.calls, 48)
      assert.ok(rounds[round]!.heapDeltaBytes!.total > 0)
      assert.equal(typeof rounds[round]!.gcNs!.avg, 'number')
    }
  }
})
