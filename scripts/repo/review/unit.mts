import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isMainModule } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { UNIT_CI_SHARD_COUNT } from '../test/shard/report.mts'
import { verifyUnitShardDirectory } from '../test/shard/verify.mts'

export interface LocalUnitShardIdentity {
  revision: string
  runId: string
  runAttempt: string
}

interface LocalUnitShardOptions {
  directory: string
  identity: LocalUnitShardIdentity
  runShard?: (
    index: number,
    directory: string,
    identity: LocalUnitShardIdentity,
  ) => void
  verify?: (directory: string, identity: LocalUnitShardIdentity) => unknown
}

export function runLocalUnitShards({
  directory,
  identity,
  runShard = executeShard,
  verify = verifyUnitShardDirectory,
}: LocalUnitShardOptions) {
  for (let index = 1; index <= UNIT_CI_SHARD_COUNT; index += 1) {
    runShard(index, directory, identity)
  }
  return verify(directory, identity)
}

function executeShard(
  index: number,
  directory: string,
  identity: LocalUnitShardIdentity,
) {
  execFileSync(
    process.execPath,
    [
      'scripts/repo/run.mts',
      'scripts/repo/test/shard/run.mts',
      '--index',
      String(index),
      '--count',
      String(UNIT_CI_SHARD_COUNT),
      '--directory',
      directory,
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        GITHUB_SHA: identity.revision,
        GITHUB_RUN_ID: identity.runId,
        GITHUB_RUN_ATTEMPT: identity.runAttempt,
      },
    },
  )
}

function createLocalReportDirectory() {
  const root = path.join(os.tmpdir(), 'nwsapi-review-unit-')
  return mkdtempSync(root)
}

function currentIdentity(): LocalUnitShardIdentity {
  return {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim(),
    runId: `local-${process.pid}-${randomUUID()}`,
    runAttempt: '1',
  }
}

export function runLocalUnitReview() {
  const directory = createLocalReportDirectory()
  console.log(`[review] Unit reports: ${directory}`)
  return runLocalUnitShards({ directory, identity: currentIdentity() })
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node scripts/repo/run.mts scripts/repo/review/unit.mts')
  } else {
    runLocalUnitReview()
  }
}
