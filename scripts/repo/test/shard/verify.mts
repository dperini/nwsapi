import path from 'node:path'
import { parseArgs } from 'node:util'
import { isMainModule } from '../../lib/run-node.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import {
  readUnitShardEnvelopes,
  unitTestFiles,
  type UnitShardIdentity,
  verifyUnitShardEnvelopes,
  UNIT_CI_SHARD_COUNT,
} from './report.mts'

export function verifyUnitShardDirectory(
  directory: string,
  identity: UnitShardIdentity = {
    revision: process.env['GITHUB_SHA'] ?? '',
    runId: process.env['GITHUB_RUN_ID'] ?? '',
    runAttempt: process.env['GITHUB_RUN_ATTEMPT'] ?? '',
  },
) {
  const result = verifyUnitShardEnvelopes(
    readUnitShardEnvelopes(directory),
    unitTestFiles(),
    identity,
  )
  console.log(
    `[test] verified ${result.fileCount} unit test files and ${result.testCount} tests across ${UNIT_CI_SHARD_COUNT} shards (${(result.laneElapsedMs / 1000).toFixed(1)}s lane, ${(result.elapsedMs / 1000).toFixed(1)}s combined); shard durations ${result.shardElapsedMs.map((duration, index) => `${index + 1}:${(duration / 1000).toFixed(1)}s`).join(' ')}`,
  )
  return result
}

export function parseUnitShardVerifyArgs(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      directory: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  })
  if (!values.help && !values.directory) {
    throw new Error('--directory must name the downloaded shard reports.')
  }
  return { directory: values.directory, help: values.help ?? false }
}

if (isMainModule(import.meta.url)) {
  const values = parseUnitShardVerifyArgs()
  if (values.help) {
    console.log(
      'Usage: node scripts/repo/run.mts scripts/repo/test/shard/verify.mts --directory <downloaded-reports>',
    )
    process.exit(0)
  }
  verifyUnitShardDirectory(path.resolve(REPO_ROOT, values.directory!))
}
