import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

test('local review reports each shard duration before verifying all reports', async () => {
  const indexes: number[] = []
  const messages: string[] = []
  let clock = 0
  let verifiedDirectory = ''
  const result = await runLocalUnitShards({
    directory: '/tmp/unit-reports',
    identity,
    log: message => messages.push(message),
    now: () => {
      clock += 25
      return clock
    },
    runShard: (index, directory, runIdentity) => {
      assert.equal(directory, '/tmp/unit-reports')
      assert.equal(runIdentity, identity)
      indexes.push(index)
    },
    concurrency: 1,
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
  assert.equal(
    messages.filter(message => message.includes('started')).length,
    UNIT_CI_SHARD_COUNT,
  )
  assert.equal(
    messages.filter(message => message.includes('finished in 25ms')).length,
    UNIT_CI_SHARD_COUNT,
  )
  assert.equal(
    messages.filter(message => message.includes('Report: unavailable')).length,
    UNIT_CI_SHARD_COUNT,
  )
})

test('local review stops scheduling after a failed shard without partial verification', async () => {
  const indexes: number[] = []
  let verified = false

  await assert.rejects(
    runLocalUnitShards({
      directory: '/tmp/unit-reports',
      identity,
      runShard: index => {
        indexes.push(index)
        if (index === 3) {
          throw new Error('shard failed')
        }
      },
      concurrency: 1,
      verify: () => {
        verified = true
      },
    }),
    /shard failed/,
  )

  assert.deepEqual(indexes, [1, 2, 3])
  assert.equal(verified, false)
})

test('CI collection runs every shard and reports all failures without partial verification', async () => {
  const indexes: number[] = []
  let verified = false
  await assert.rejects(
    runLocalUnitShards({
      directory: '/tmp/unit-reports',
      identity,
      collectFailures: true,
      log: () => {},
      runShard: async index => {
        await new Promise<void>(resolve => setImmediate(resolve))
        indexes.push(index)
        if (index === 3 || index === 10) {
          throw new Error('fixture failure')
        }
      },
      verify: () => {
        verified = true
      },
    }),
    (error: unknown) =>
      error instanceof AggregateError && error.errors.length === 2,
  )
  assert.equal(indexes.length, UNIT_CI_SHARD_COUNT)
  assert.equal(indexes.at(-1), UNIT_CI_SHARD_COUNT)
  assert.equal(verified, false)
})

test('local review runs shards in bounded parallel lanes', async () => {
  let active = 0
  let peak = 0
  await runLocalUnitShards({
    directory: '/tmp/unit-reports',
    identity,
    log: () => {},
    concurrency: 3,
    runShard: async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise<void>(resolve => setImmediate(resolve))
      active -= 1
    },
    verify: () => 'verified',
  })
  assert.equal(peak, 3)
})

test('failed shards print a focused command from their fresh report and retain full verification', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-review-test-'))
  try {
    const shardDirectory = path.join(directory, 'nwsapi-unit-shard-3-test')
    const envelope = path.join(shardDirectory, 'unit-shard-3.json')
    const vitestReport = path.join(shardDirectory, 'unit-shard-3.vitest.json')
    const messages: string[] = []
    let verified = false
    mkdirSync(shardDirectory)
    writeFileSync(envelope, '{}')
    writeFileSync(
      vitestReport,
      JSON.stringify({
        testResults: [
          { name: 'test/repo/unit/failing.test.mts', status: 'failed' },
          { name: 'test/repo/unit/passing.test.mts', status: 'passed' },
        ],
      }),
    )

    await assert.rejects(
      runLocalUnitShards({
        directory,
        identity,
        log: message => messages.push(message),
        runShard: index => {
          if (index === 3) {
            throw new Error('shard failed')
          }
        },
        concurrency: 1,
        verify: () => {
          verified = true
        },
      }),
      /shard failed/,
    )

    assert.ok(
      messages.includes(
        "[review]   pnpm run test:unit -- 'test/repo/unit/failing.test.mts'",
      ),
    )
    assert.ok(messages.some(message => message.includes('diagnostic only')))
    assert.ok(messages.some(message => message.includes(envelope)))
    assert.equal(verified, false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
