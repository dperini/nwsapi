import { parseArgs } from 'node:util'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from '../../lib/run-node.mts'
import { runBudgeted, testBudget } from '../../lib/test-budget.mts'
import {
  UNIT_CI_SHARD_COUNT,
  type UnitShardEnvelope,
  type VitestShardReport,
} from './report.mts'

interface ShardOptions {
  index: number
  count: number
  directory: string
}

function parseShardOptions(args: string[]): ShardOptions | undefined {
  const { values } = parseArgs({
    args,
    options: {
      index: { type: 'string' },
      count: { type: 'string' },
      directory: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log(
      'Usage: node scripts/repo/run.mts scripts/repo/test/shard/run.mts --index <n> --count 16 --directory <runner-temp>',
    )
    return undefined
  }
  const index = Number(values.index)
  const count = Number(values.count)
  if (!Number.isInteger(index) || index < 1 || index > count) {
    throw new Error(`Unit CI shard index must be from 1 to ${count}.`)
  }
  if (!Number.isInteger(count) || count !== UNIT_CI_SHARD_COUNT) {
    throw new Error(`Unit CI shards require a count of ${UNIT_CI_SHARD_COUNT}.`)
  }
  if (!values.directory) {
    throw new Error('--directory must name the shard report parent.')
  }

  return { index, count, directory: values.directory }
}

function createOutputDirectory(index: number, directory: string) {
  const tempRoot = path.resolve(process.env['RUNNER_TEMP'] ?? os.tmpdir())
  const reportRoot = path.resolve(directory)
  const rootRelative = path.relative(tempRoot, reportRoot)
  if (path.isAbsolute(rootRelative) || rootRelative.startsWith('..')) {
    throw new Error('--directory must be inside RUNNER_TEMP.')
  }
  mkdirSync(reportRoot, { recursive: true })
  return mkdtempSync(path.join(reportRoot, `nwsapi-unit-shard-${index}-`))
}

async function executeShard(index: number, count: number, directory: string) {
  const outputDirectory = createOutputDirectory(index, directory)
  const output = path.join(outputDirectory, `unit-shard-${index}.json`)
  const vitestOutput = output.replace(/\.json$/, '.vitest.json')
  const startedAt = new Date().toISOString()
  const startedClock = performance.now()
  const code = await runBudgeted(
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      '.config/repo/vitest.config.mts',
      `--shard=${index}/${count}`,
      '--reporter=json',
      `--outputFile=${vitestOutput}`,
    ],
    testBudget('unit', false),
    `unit shard ${index}/${count}`,
    { ...process.env, NWSAPI_TEST_TIER: 'unit' },
  )
  const elapsedMs = performance.now() - startedClock
  const finishedAt = new Date().toISOString()
  const report = existsSync(vitestOutput)
    ? (JSON.parse(readFileSync(vitestOutput, 'utf8')) as VitestShardReport)
    : null
  const envelope: UnitShardEnvelope = {
    schemaVersion: 1,
    shardIndex: index,
    shardCount: count,
    revision: process.env['GITHUB_SHA'] ?? '',
    runId: process.env['GITHUB_RUN_ID'] ?? '',
    runAttempt: process.env['GITHUB_RUN_ATTEMPT'] ?? '',
    startedAt,
    finishedAt,
    elapsedMs,
    exitCode: code,
    report,
  }
  writeFileSync(output, `${JSON.stringify(envelope)}\n`)
  if (code !== 0) {
    process.exitCode = code
  }
  return envelope
}

export async function runUnitCiShard(args = process.argv.slice(2)) {
  const options = parseShardOptions(args)
  if (!options) {
    return undefined
  }
  return executeShard(options.index, options.count, options.directory)
}

if (isMainModule(import.meta.url)) {
  await runUnitCiShard()
}
