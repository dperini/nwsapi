import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { retainFailedReviewReports } from '../../../../../scripts/repo/test/onboarding/reports.mts'

test('retains only failed structured shard reports and redacts their values', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-onboarding-reports-'))
  const sandbox = path.join(root, 'sandbox')
  const destination = path.join(root, 'retained')
  const failedShard = path.join(
    sandbox,
    'tmp/nwsapi-review-unit-one/nwsapi-unit-shard-4-run',
  )
  const passingShard = path.join(
    sandbox,
    'tmp/nwsapi-review-unit-one/nwsapi-unit-shard-5-run',
  )
  mkdirSync(failedShard, { recursive: true })
  mkdirSync(passingShard, { recursive: true })
  writeFileSync(
    path.join(failedShard, 'unit-shard-4.json'),
    JSON.stringify({
      schemaVersion: 1,
      shardIndex: 4,
      exitCode: 1,
      report: { success: false, numFailedTestSuites: 1 },
    }),
  )
  writeFileSync(
    path.join(failedShard, 'unit-shard-4.vitest.json'),
    JSON.stringify({
      success: false,
      numFailedTestSuites: 1,
      testResults: [
        {
          name: 'test/repo/unit/check/catalog.test.mts',
          status: 'failed',
          failureMessage: 'private secret-value',
        },
      ],
    }),
  )
  writeFileSync(path.join(failedShard, 'arbitrary.json'), '{}')
  writeFileSync(
    path.join(passingShard, 'unit-shard-5.json'),
    JSON.stringify({
      schemaVersion: 1,
      shardIndex: 5,
      exitCode: 0,
      report: { success: true, numFailedTestSuites: 0 },
    }),
  )
  try {
    const retained = await retainFailedReviewReports({
      sandbox,
      destination,
      redact: value => value.replaceAll('secret-value', '[redacted]'),
    })
    assert.equal(retained.length, 2)
    assert.deepEqual(retained.map(file => path.basename(file)).toSorted(), [
      'unit-shard-4.json',
      'unit-shard-4.vitest.json',
    ])
    const vitest = JSON.parse(
      readFileSync(
        retained.find(file => file.endsWith('.vitest.json'))!,
        'utf8',
      ),
    ) as {
      testResults: Array<{ failureMessage: string }>
    }
    assert.equal(vitest.testResults[0]!.failureMessage, 'private [redacted]')
    assert.equal(
      readdirSync(path.dirname(retained[0]!)).includes('arbitrary.json'),
      false,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('report retention enforces per-file and aggregate size limits', async () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-onboarding-report-size-'),
  )
  const sandbox = path.join(root, 'sandbox')
  const shard = path.join(
    sandbox,
    'tmp/nwsapi-review-unit-run/nwsapi-unit-shard-2-case',
  )
  mkdirSync(shard, { recursive: true })
  writeFileSync(
    path.join(shard, 'unit-shard-2.json'),
    JSON.stringify({
      exitCode: 1,
      report: { success: false, numFailedTestSuites: 1 },
    }),
  )
  try {
    const retained = await retainFailedReviewReports({
      sandbox,
      destination: path.join(root, 'retained'),
      redact: value => value,
      maxReportBytes: 10,
      maxTotalBytes: 10,
    })
    assert.deepEqual(retained, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
