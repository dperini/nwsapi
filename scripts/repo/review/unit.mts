import { execFileSync } from 'node:child_process'
import { globSync, mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isMainModule } from '../lib/run-node.mts'
import { normalizePath, REPO_ROOT } from '../lib/paths.mts'
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
  log?: (message: string) => void
  now?: () => number
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
  log = console.log,
  now = () => performance.now(),
  runShard = executeShard,
  verify = verifyUnitShardDirectory,
}: LocalUnitShardOptions) {
  for (let index = 1; index <= UNIT_CI_SHARD_COUNT; index += 1) {
    const started = now()
    log(`[review] Unit shard ${index}/${UNIT_CI_SHARD_COUNT} started.`)
    try {
      runShard(index, directory, identity)
    } catch (error) {
      const report = shardReportPath(directory, index)
      const elapsedMs = Math.round(now() - started)
      logShardCompletion(log, index, elapsedMs, report)
      logShardFailure(log, report)
      throw error
    }
    const elapsedMs = Math.round(now() - started)
    logShardCompletion(log, index, elapsedMs, shardReportPath(directory, index))
  }
  return verify(directory, identity)
}

function shardReportPath(directory: string, index: number) {
  const reports = globSync(`**/unit-shard-${index}*.json`, { cwd: directory })
    .filter(file =>
      [`unit-shard-${index}.json`, `unit-shard-${index}.vitest.json`].includes(
        path.basename(file),
      ),
    )
    .toSorted()
  const report =
    reports.find(file => path.basename(file) === `unit-shard-${index}.json`) ??
    reports[0]
  return report ? path.resolve(directory, report) : undefined
}

function logShardCompletion(
  log: (message: string) => void,
  index: number,
  elapsedMs: number,
  report: string | undefined,
) {
  const reportText = report ? ` Report: ${report}` : ' Report: unavailable.'
  log(
    `[review] Unit shard ${index}/${UNIT_CI_SHARD_COUNT} finished in ${elapsedMs}ms.${reportText}`,
  )
}

function logShardFailure(
  log: (message: string) => void,
  report: string | undefined,
) {
  const failedSuites = failedSuitePaths(report)
  if (failedSuites.length) {
    log(
      '[review] Focused diagnostics for failed suites (not a full inventory):',
    )
    for (const suite of failedSuites) {
      log(`[review]   pnpm run test:unit -- ${shellArgument(suite)}`)
    }
  } else {
    log(
      '[review] Failed suite paths are unavailable. Rerun the unit step with: pnpm run test:unit',
    )
  }
  log(
    '[review] A focused run is diagnostic only. The full unit inventory remains required. Rerun pnpm run review after resolving the failure.',
  )
}

function failedSuitePaths(reportPath: string | undefined) {
  if (!reportPath?.endsWith('.json')) {
    return []
  }
  const vitestPath = reportPath.endsWith('.vitest.json')
    ? reportPath
    : reportPath.replace(/\.json$/, '.vitest.json')
  try {
    const report = JSON.parse(readFileSync(vitestPath, 'utf8')) as {
      testResults?: Array<{ name?: unknown; status?: unknown }>
    }
    return [
      ...new Set(
        (report.testResults ?? [])
          .filter(
            suite =>
              suite.status === 'failed' && typeof suite.name === 'string',
          )
          .map(suite => {
            const name = suite.name as string
            const absolute = path.isAbsolute(name)
              ? name
              : path.resolve(REPO_ROOT, name)
            return normalizePath(path.relative(REPO_ROOT, absolute))
          })
          .filter(file => file.startsWith('test/repo/unit/')),
      ),
    ]
  } catch {
    return []
  }
}

function shellArgument(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
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
