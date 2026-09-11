import { describe, expect, test } from 'vitest'

import { readCompletedFiles } from '../../../../../../scripts/fleet/test/budget/balance/input.mts'
import {
  planRecoveryShards,
  verifyShardInventory,
} from '../../../../../../scripts/fleet/test/budget/balance/plan.mts'

function report() {
  return {
    success: true,
    numTotalTests: 3,
    numPassedTests: 3,
    testResults: [9, 6, 3].map((duration, index) => ({
      name: `test-${index}.mts`,
      status: 'passed',
      startTime: 100,
      endTime: 100 + duration,
      assertionResults: [{ status: 'passed' }],
    })),
  }
}

describe('test budget recovery', () => {
  test('balances measured work and retains every file and test without mutating input', () => {
    const files = readCompletedFiles(report())
    const original = files.map(file => ({ ...file }))
    const shards = planRecoveryShards(files, 2)
    expect(shards.map(shard => shard.fileTimeMs)).toEqual([9, 9])
    expect(
      shards
        .flatMap(shard => shard.files)
        .reduce((sum, file) => sum + file.tests, 0),
    ).toBe(3)
    expect(files).toEqual(original)
    expect(() => verifyShardInventory(files, shards)).not.toThrow()
  })

  test.each([0, -1, 1.5, 4, NaN])('rejects invalid shard count %s', count => {
    expect(() =>
      planRecoveryShards(readCompletedFiles(report()), count),
    ).toThrow()
  })

  test('rejects omitted and duplicated shard members', () => {
    const files = readCompletedFiles(report())
    const shards = planRecoveryShards(files, 2)
    shards[0]!.files.pop()
    expect(() => verifyShardInventory(files, shards)).toThrow()
    shards[0]!.files.push(files[1]!)
    expect(() => verifyShardInventory(files, shards)).toThrow()
  })

  test('rejects incomplete reports and invalid durations', () => {
    const data = report()
    data.numTotalTests += 1
    expect(() => readCompletedFiles(data)).toThrow()
    data.numTotalTests -= 1
    data.testResults[0]!.endTime = 99
    expect(() => readCompletedFiles(data)).toThrow()
  })

  test('rejects skipped cases, failures, and ambiguous project identities', () => {
    const data = report()
    data.testResults[0]!.assertionResults[0]!.status = 'pending'
    expect(() => readCompletedFiles(data)).toThrow()
    data.testResults[0]!.assertionResults[0]!.status = 'passed'
    data.testResults[0]!.name = data.testResults[1]!.name
    expect(() => readCompletedFiles(data)).toThrow()
    data.success = false
    expect(() => readCompletedFiles(data)).toThrow()
  })
})
