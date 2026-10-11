import { parseArgs } from 'node:util'
import path from 'node:path'
import { isMainModule } from '../../lib/run-node.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import {
  readUnitShardEnvelopes,
  unitTestFiles,
  verifyUnitShardEnvelopes,
  UNIT_CI_SHARD_COUNT,
} from './report.mts'

export function verifyUnitShardDirectory(directory: string) {
  const result = verifyUnitShardEnvelopes(
    readUnitShardEnvelopes(directory),
    unitTestFiles(),
    {
      revision: process.env['GITHUB_SHA'] ?? '',
      runId: process.env['GITHUB_RUN_ID'] ?? '',
      runAttempt: process.env['GITHUB_RUN_ATTEMPT'] ?? '',
    },
  )
  console.log(
    `[test] verified ${result.fileCount} unit test files and ${result.testCount} tests across ${UNIT_CI_SHARD_COUNT} shards (${(result.laneElapsedMs / 1000).toFixed(1)}s lane, ${(result.elapsedMs / 1000).toFixed(1)}s combined); shard durations ${result.shardElapsedMs.map((duration, index) => `${index + 1}:${(duration / 1000).toFixed(1)}s`).join(' ')}`,
  )
  return result
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      directory: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (
    values.help ||
    process.argv.includes('--help') ||
    process.argv.includes('-h')
  ) {
    console.log(
      'Usage: node scripts/repo/run.mts scripts/repo/test/shard/verify.mts --directory <downloaded-reports>',
    )
    process.exit(0)
  }
  if (!values.directory) {
    throw new Error('--directory must name the downloaded shard reports.')
  }
  verifyUnitShardDirectory(path.resolve(REPO_ROOT, values.directory))
}
