import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface TypeCoverageMetric {
  covered: number
  total: number
  pct: number
}

interface TypeCoverageProcess {
  status: number | null
  stdout: string
  stderr: string
  error?: Error | undefined
}

export function parseTypeCoverage(output: string): TypeCoverageMetric {
  const result = JSON.parse(output)
  const { correctCount: covered, totalCount: total } = result
  if (
    result.succeeded !== true ||
    !Number.isSafeInteger(covered) ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    covered < 0 ||
    covered > total
  ) {
    throw new Error(`Invalid type coverage result: ${result.error ?? output}`)
  }
  return { covered, total, pct: Math.floor((10_000 * covered) / total) / 100 }
}

export function runTypeCoverage(
  root: string,
  execute: (command: string, args: string[]) => TypeCoverageProcess = (
    command,
    args,
  ) => spawnSync(command, args, { cwd: root, encoding: 'utf8' }),
): TypeCoverageMetric {
  const result = execute(process.execPath, [
    path.join(root, 'node_modules/type-coverage/bin/type-coverage'),
    '--project',
    path.join(root, '.config/tsconfig.check.json'),
    '--strict',
    '--json-output',
  ])
  if (result.error || result.status !== 0 || result.stderr.trim()) {
    throw new Error(
      `Type coverage analysis failed in ${root}: ${result.error?.message ?? result.stderr + result.stdout}`,
    )
  }
  const metric = parseTypeCoverage(result.stdout)
  console.log(
    `Type coverage: ${metric.pct}% (${metric.covered}/${metric.total} typed identifiers)`,
  )
  return metric
}

export function writeTypeCoverage(root: string, metric: TypeCoverageMetric) {
  const directory = path.join(root, 'coverage')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, 'type-coverage.json'),
    JSON.stringify(metric, null, 2) + '\n',
  )
}

export function accumulatedCoverage(
  execution: unknown,
  types: TypeCoverageMetric,
) {
  return { execution, types }
}
