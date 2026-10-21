import { spawn, execFileSync } from 'node:child_process'
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
  collectFailures?: boolean
  runShard?: (
    index: number,
    directory: string,
    identity: LocalUnitShardIdentity,
  ) => void | Promise<void>
  concurrency?: number
  verify?: (directory: string, identity: LocalUnitShardIdentity) => unknown
}

export async function runLocalUnitShards({
  directory,
  identity,
  log = console.log,
  now = () => performance.now(),
  collectFailures = false,
  runShard = executeShard,
  concurrency = Math.min(2, os.availableParallelism()),
  verify = verifyUnitShardDirectory,
}: LocalUnitShardOptions) {
  const failures: Error[] = []
  let nextIndex = 1
  const runWorker = async () => {
    while (nextIndex <= UNIT_CI_SHARD_COUNT) {
      const index = nextIndex
      nextIndex += 1
      const started = now()
      log(`[review] Unit shard ${index}/${UNIT_CI_SHARD_COUNT} started.`)
      try {
        await runShard(index, directory, identity)
      } catch (error) {
        const report = shardReportPath(directory, index)
        const elapsedMs = Math.round(now() - started)
        logShardCompletion(log, index, elapsedMs, report)
        logShardFailure(log, report)
        failures.push(new Error(`Unit shard ${index} failed`, { cause: error }))
        if (!collectFailures) {
          nextIndex = UNIT_CI_SHARD_COUNT + 1
        }
        continue
      }
      const elapsedMs = Math.round(now() - started)
      logShardCompletion(
        log,
        index,
        elapsedMs,
        shardReportPath(directory, index),
      )
    }
  }
  const workerCount = Math.max(
    1,
    Math.min(UNIT_CI_SHARD_COUNT, Math.floor(concurrency)),
  )
  await Promise.all(Array.from({ length: workerCount }, runWorker))
  if (failures.length) {
    if (!collectFailures) {
      throw failures[0]!.cause
    }
    throw new AggregateError(
      failures,
      `${failures.length} unit shards failed. See their retained reports.`,
    )
  }
  return verify(directory, identity)
}

export function shardReportPath(directory: string, index: number) {
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

export function logShardCompletion(
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

export function logShardFailure(
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

export function failedSuitePaths(reportPath: string | undefined) {
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

export function shellArgument(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function executeShard(
  index: number,
  directory: string,
  identity: LocalUnitShardIdentity,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
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
          NWSAPI_TEST_BUILD_READY: '1',
          NWSAPI_LOCAL_REVIEW_TEST: '1',
          GITHUB_SHA: identity.revision,
          GITHUB_RUN_ID: identity.runId,
          GITHUB_RUN_ATTEMPT: identity.runAttempt,
        },
      },
    )
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `Unit shard ${index} exited ${signal ? `on ${signal}` : `with code ${code}`}.`,
        ),
      )
    })
  })
}

export function createLocalReportDirectory() {
  const root = path.join(os.tmpdir(), 'nwsapi-review-unit-')
  return mkdtempSync(root)
}

export function currentIdentity(): LocalUnitShardIdentity {
  return {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim(),
    runId: `local-${process.pid}-${randomUUID()}`,
    runAttempt: '1',
  }
}

export async function runLocalUnitReview() {
  const directory = createLocalReportDirectory()
  console.log(`[review] Unit reports: ${directory}`)
  if (process.env['NWSAPI_TEST_BUILD_READY'] !== '1') {
    execFileSync(process.execPath, ['scripts/repo/build/run.mts'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
  }
  return await runLocalUnitShards({
    directory,
    identity: currentIdentity(),
    collectFailures: ['1', 'true'].includes(process.env['CI'] ?? ''),
  })
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node scripts/repo/run.mts scripts/repo/review/unit.mts')
  } else {
    await runLocalUnitReview()
  }
}
