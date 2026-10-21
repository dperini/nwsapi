import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compareBenchmarkRounds } from '../../../fleet/bench/comparison.mts'
import { REPO_ROOT, normalizePath } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import { sha256 } from '../footprint/shared.mts'
import { geomean } from '../planner/display.mts'
import type { Row } from '../planner/measure.mts'

export interface SurveyMeasurement {
  metadata: { labels: string[]; variants: string[]; [key: string]: unknown }
  rows: Array<Pick<Row, 'id' | 'family' | 'samples'>>
}

export const summaryUsage = 'Usage: survey/summary.mts <measurement.json> [...]'

export function summarizeSurvey(data: SurveyMeasurement) {
  const baseline = data.metadata.labels.indexOf('baseline')
  const candidate = data.metadata.labels.indexOf('candidate')
  if (baseline < 0 || candidate < 0 || !data.rows.length) {
    throw new Error('Expected baseline and candidate labels and measured rows.')
  }
  const rows = data.rows.map(row => {
    const comparison = compareBenchmarkRounds(
      (row.samples[baseline] || []).map((cost, round) => ({ round, cost })),
      (row.samples[candidate] || []).map((cost, round) => ({ round, cost })),
    )
    return {
      id: row.id,
      family: row.family,
      speedup: comparison.baseline.median / comparison.candidate.median,
      baseline: comparison.baseline,
      candidate: comparison.candidate,
      relativeChange: comparison.relativeChange,
    }
  })
  return {
    metadata: data.metadata,
    methodology:
      'Ratios of median round costs. Paired relative changes are (candidate - baseline) / baseline. Rounds share process state. Ranges are descriptive, not confidence intervals.',
    geomeanSpeedup: geomean(rows.map(row => row.speedup)),
    largestSlowdown: Math.max(0, ...rows.map(row => 1 / row.speedup - 1)),
    rows,
  }
}

export function readSurveySummary(file: string) {
  const bytes = readFileSync(file)
  return {
    source: normalizePath(path.relative(REPO_ROOT, path.resolve(file))),
    sha256: sha256(bytes),
    ...summarizeSurvey(JSON.parse(bytes.toString('utf8')) as SurveyMeasurement),
  }
}

export function summarizeFiles(args: string[]) {
  if (!args.length) {
    throw new Error(summaryUsage)
  }
  return args.map(readSurveySummary)
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  console.log(
    args.includes('--help')
      ? summaryUsage
      : JSON.stringify(summarizeFiles(args), null, 2),
  )
}
