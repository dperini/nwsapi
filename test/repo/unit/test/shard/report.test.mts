import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'vitest'

import {
  type UnitShardEnvelope,
  type UnitShardIdentity,
  verifyUnitShardEnvelopes,
} from '../../../../../scripts/repo/test/shard/report.mts'
import { REPO_ROOT } from '../../../../../scripts/repo/lib/paths.mts'

const identity: UnitShardIdentity = {
  revision: 'revision-a',
  runId: 'run-1',
  runAttempt: '1',
}
const files = [
  'test/repo/unit/fixture/a.test.mts',
  'test/repo/unit/fixture/b.test.mts',
]

function shard(
  shardIndex: number,
  file: string,
  overrides: Partial<UnitShardEnvelope> = {},
): UnitShardEnvelope {
  return {
    schemaVersion: 1,
    shardIndex,
    shardCount: 2,
    ...identity,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    elapsedMs: 1000,
    exitCode: 0,
    report: {
      success: true,
      numFailedTestSuites: 0,
      numPendingTestSuites: 0,
      numTotalTests: 3,
      numPassedTests: 3,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: [{ name: path.join(REPO_ROOT, file), status: 'passed' }],
    },
    ...overrides,
  }
}

test('the complete shard reports account for each test file once', () => {
  assert.deepEqual(
    verifyUnitShardEnvelopes(
      [shard(1, files[0]!), shard(2, files[1]!)],
      files,
      identity,
      2,
    ),
    {
      fileCount: 2,
      testCount: 6,
      elapsedMs: 2000,
      laneElapsedMs: 1000,
      shardElapsedMs: [1000, 1000],
    },
  )
})

test('missing shard reports fail verification', () => {
  assert.throws(
    () => verifyUnitShardEnvelopes([shard(1, files[0]!)], files, identity, 2),
    /Missing unit shard reports: 2/,
  )
})

test('invalid shard timing fails verification', () => {
  assert.throws(
    () =>
      verifyUnitShardEnvelopes(
        [shard(1, files[0]!, { elapsedMs: Number.NaN }), shard(2, files[1]!)],
        files,
        identity,
        2,
      ),
    /invalid timing data/,
  )
})

test('duplicate and missing files fail verification', () => {
  assert.throws(
    () =>
      verifyUnitShardEnvelopes(
        [shard(1, files[0]!), shard(2, files[0]!)],
        files,
        identity,
        2,
      ),
    /Missing files:.*b\.test\.mts.*Duplicate files:.*a\.test\.mts/,
  )
})

test('unexpected files fail verification', () => {
  assert.throws(
    () =>
      verifyUnitShardEnvelopes(
        [
          shard(1, files[0]!, { shardCount: 3 }),
          shard(2, files[1]!, { shardCount: 3 }),
          shard(3, 'test/repo/unit/fixture/extra.test.mts', { shardCount: 3 }),
        ],
        files,
        identity,
        3,
      ),
    /Unexpected files:.*extra\.test\.mts/,
  )
})

test('reports from another workflow run or a failed shard are rejected', () => {
  assert.throws(
    () =>
      verifyUnitShardEnvelopes(
        [shard(1, files[0]!, { revision: 'revision-b' }), shard(2, files[1]!)],
        files,
        identity,
        2,
      ),
    /belongs to another run/,
  )
  assert.throws(
    () =>
      verifyUnitShardEnvelopes(
        [shard(1, files[0]!, { exitCode: 1 }), shard(2, files[1]!)],
        files,
        identity,
        2,
      ),
    /Unit shard 1 did not pass/,
  )
  assert.throws(
    () =>
      verifyUnitShardEnvelopes(
        [
          shard(1, files[0]!, {
            report: {
              ...shard(1, files[0]!).report!,
              numPendingTests: 1,
            },
          }),
          shard(2, files[1]!),
        ],
        files,
        identity,
        2,
      ),
    /Unit shard 1 did not pass/,
  )
})
