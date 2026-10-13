import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { normalizePath, REPO_ROOT } from '../../lib/paths.mts'

export const UNIT_CI_SHARD_COUNT = 32

export interface VitestShardReport {
  success: boolean
  numFailedTestSuites: number
  numPendingTestSuites: number
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  numTodoTests: number
  testResults: Array<{ name: string; status: string }>
}

export interface UnitShardEnvelope {
  schemaVersion: 1
  shardIndex: number
  shardCount: number
  revision: string
  runId: string
  runAttempt: string
  startedAt: string
  finishedAt: string
  elapsedMs: number
  exitCode: number
  report: VitestShardReport | null
}

export interface UnitShardIdentity {
  revision: string
  runId: string
  runAttempt: string
}

export function unitTestFiles(root = REPO_ROOT): string[] {
  return globSync('test/repo/unit/**/*.test.mts', { cwd: root })
    .map(normalizePath)
    .toSorted()
}

export function readUnitShardEnvelopes(directory: string): UnitShardEnvelope[] {
  const paths = globSync('**/unit-shard-*.json', { cwd: directory })
    .filter(file => /^unit-shard-\d+\.json$/.test(path.basename(file)))
    .toSorted()
  return paths.map(file => {
    return JSON.parse(
      readFileSync(path.join(directory, file), 'utf8'),
    ) as UnitShardEnvelope
  })
}

export function verifyUnitShardEnvelopes(
  envelopes: readonly UnitShardEnvelope[],
  expectedFiles: readonly string[],
  identity: UnitShardIdentity,
  shardCount = UNIT_CI_SHARD_COUNT,
): {
  fileCount: number
  testCount: number
  elapsedMs: number
  laneElapsedMs: number
  shardElapsedMs: number[]
} {
  const byShard = new Map<number, UnitShardEnvelope>()
  const observed = new Map<string, number>()
  let testCount = 0
  let elapsedMs = 0
  let firstStartedAt = Number.POSITIVE_INFINITY
  let lastFinishedAt = Number.NEGATIVE_INFINITY
  const shardElapsedMs: number[] = []

  for (const envelope of envelopes) {
    assertShardMetadata(envelope, shardCount)
    if (byShard.has(envelope.shardIndex)) {
      throw new Error(
        `Unit shard ${envelope.shardIndex} reported more than once.`,
      )
    }
    assertShardIdentity(envelope, identity)
    assertShardTiming(envelope)
    const report = assertShardPassed(envelope)

    byShard.set(envelope.shardIndex, envelope)
    testCount += report.numTotalTests
    elapsedMs += envelope.elapsedMs
    shardElapsedMs[envelope.shardIndex - 1] = envelope.elapsedMs
    firstStartedAt = Math.min(firstStartedAt, Date.parse(envelope.startedAt))
    lastFinishedAt = Math.max(lastFinishedAt, Date.parse(envelope.finishedAt))
    recordSuites(envelope, observed)
  }

  assertAllShardsPresent(byShard, shardCount)
  assertCompleteInventory(observed, expectedFiles)
  return {
    fileCount: observed.size,
    testCount,
    elapsedMs,
    laneElapsedMs: lastFinishedAt - firstStartedAt,
    shardElapsedMs,
  }
}

function assertShardTiming(envelope: UnitShardEnvelope) {
  const startedAt = Date.parse(envelope.startedAt)
  const finishedAt = Date.parse(envelope.finishedAt)
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(finishedAt) ||
    finishedAt < startedAt ||
    !Number.isFinite(envelope.elapsedMs) ||
    envelope.elapsedMs < 0
  ) {
    throw new Error(
      `Unit shard ${envelope.shardIndex} has invalid timing data.`,
    )
  }
}

function assertShardMetadata(envelope: UnitShardEnvelope, shardCount: number) {
  if (
    envelope.schemaVersion !== 1 ||
    envelope.shardCount !== shardCount ||
    !Number.isInteger(envelope.shardIndex) ||
    envelope.shardIndex < 1 ||
    envelope.shardIndex > shardCount
  ) {
    throw new Error('A unit shard report has invalid shard metadata.')
  }
}

function assertShardIdentity(
  envelope: UnitShardEnvelope,
  identity: UnitShardIdentity,
) {
  if (
    !identity.revision ||
    !identity.runId ||
    !identity.runAttempt ||
    envelope.revision !== identity.revision ||
    envelope.runId !== identity.runId ||
    envelope.runAttempt !== identity.runAttempt
  ) {
    throw new Error(`Unit shard ${envelope.shardIndex} belongs to another run.`)
  }
}

function assertShardPassed(envelope: UnitShardEnvelope): VitestShardReport {
  const report = envelope.report
  if (
    envelope.exitCode !== 0 ||
    !report ||
    !report.success ||
    report.numFailedTestSuites !== 0 ||
    report.numPendingTestSuites !== 0 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    !Number.isInteger(report.numTotalTests) ||
    report.numPassedTests !== report.numTotalTests ||
    !Array.isArray(report.testResults) ||
    !report.testResults.every(
      suite =>
        suite &&
        typeof suite.name === 'string' &&
        typeof suite.status === 'string',
    )
  ) {
    throw new Error(`Unit shard ${envelope.shardIndex} did not pass.`)
  }
  return report
}

function recordSuites(
  envelope: UnitShardEnvelope,
  observed: Map<string, number>,
) {
  for (const suite of envelope.report!.testResults) {
    if (suite.status !== 'passed') {
      throw new Error(
        `Unit shard ${envelope.shardIndex} has a non-passing suite: ${suite.name}`,
      )
    }
    const relative = normalizePath(
      path.relative(REPO_ROOT, path.resolve(suite.name)),
    )
    if (relative === '..' || relative.startsWith('..')) {
      throw new Error(
        `Unit shard ${envelope.shardIndex} reported a file outside the repository.`,
      )
    }
    observed.set(relative, (observed.get(relative) ?? 0) + 1)
  }
}

function assertAllShardsPresent(
  byShard: Map<number, UnitShardEnvelope>,
  shardCount: number,
) {
  const missing: number[] = []
  for (let index = 1; index <= shardCount; index += 1) {
    if (!byShard.has(index)) {
      missing.push(index)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing unit shard reports: ${missing.join(', ')}.`)
  }
}

function assertCompleteInventory(
  observed: Map<string, number>,
  expectedFiles: readonly string[],
) {
  const expected = new Set(expectedFiles)
  const missing = expectedFiles.filter(file => !observed.has(file))
  const unexpected = [...observed.keys()].filter(file => !expected.has(file))
  const duplicates = [...observed.entries()]
    .filter(([, count]) => count !== 1)
    .map(([file, count]) => `${file} (${count} reports)`)
  if (missing.length || unexpected.length || duplicates.length) {
    throw new Error(
      [
        missing.length ? `Missing files: ${missing.join(', ')}.` : '',
        unexpected.length ? `Unexpected files: ${unexpected.join(', ')}.` : '',
        duplicates.length ? `Duplicate files: ${duplicates.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
  }
}
