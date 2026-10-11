import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  runLocalUnitShards,
  type LocalUnitShardIdentity,
} from '../../../../scripts/repo/review/unit.mts'
import { UNIT_CI_SHARD_COUNT } from '../../../../scripts/repo/test/shard/report.mts'

const identity: LocalUnitShardIdentity = {
  revision: 'revision-a',
  runId: 'local-test',
  runAttempt: '1',
}

test('local review runs every shard serially and verifies the shared report set', () => {
  const indexes: number[] = []
  let verifiedDirectory = ''
  const result = runLocalUnitShards({
    directory: '/tmp/unit-reports',
    identity,
    runShard: (index, directory, runIdentity) => {
      assert.equal(directory, '/tmp/unit-reports')
      assert.equal(runIdentity, identity)
      indexes.push(index)
    },
    verify: directory => {
      verifiedDirectory = directory
      return 'verified'
    },
  })

  assert.deepEqual(
    indexes,
    Array.from({ length: UNIT_CI_SHARD_COUNT }, (_, index) => index + 1),
  )
  assert.equal(verifiedDirectory, '/tmp/unit-reports')
  assert.equal(result, 'verified')
})

test('local review stops on the first failed shard without partial verification', () => {
  const indexes: number[] = []
  let verified = false

  assert.throws(
    () =>
      runLocalUnitShards({
        directory: '/tmp/unit-reports',
        identity,
        runShard: index => {
          indexes.push(index)
          if (index === 3) {
            throw new Error('shard failed')
          }
        },
        verify: () => {
          verified = true
        },
      }),
    /shard failed/,
  )

  assert.deepEqual(indexes, [1, 2, 3])
  assert.equal(verified, false)
})
