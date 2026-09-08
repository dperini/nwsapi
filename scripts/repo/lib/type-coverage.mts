import { measureNativeTypeCoverage } from '../cover/types/analysis.mts'
import type { NativeTypeCoverageResult } from '../cover/types/analysis.mts'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface TypeCoverageMetric {
  covered: number
  total: number
  pct: number
}

export function runTypeCoverage(
  root: string,
  measure = measureNativeTypeCoverage,
): NativeTypeCoverageResult {
  const metric = measure(path.join(root, '.config/tsconfig.check.json'))
  console.log(
    `Type coverage: ${metric.pct}% (${metric.covered}/${metric.total} typed identifiers; ${metric.engine}, strict=${metric.strict})`,
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
