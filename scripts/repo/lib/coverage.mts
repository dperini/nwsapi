import path from 'node:path'
import { normalizeCoverageLocations } from './coverage-normalize.mts'
import libCoverage from 'istanbul-lib-coverage'
import type { CoverageMap, CoverageMapData } from 'istanbul-lib-coverage'
import type { ReportOptions } from 'istanbul-reports'
import { coverageThresholds } from '../../../.config/coverage.config.mts'

export function coverageReporters(
  ci = process.env['CI'],
): Array<keyof ReportOptions> {
  return ci
    ? ['text', 'json', 'json-summary', 'html']
    : ['text', 'json', 'json-summary']
}

export function checkCoverageThresholds(
  summary: Record<keyof typeof coverageThresholds, { pct: number | string }>,
) {
  const failures: string[] = []
  for (const metric of Object.keys(coverageThresholds) as Array<
    keyof typeof coverageThresholds
  >) {
    const actual = summary[metric]?.pct
    const minimum = coverageThresholds[metric]
    if (
      typeof actual !== 'number' ||
      !Number.isFinite(actual) ||
      actual < minimum
    ) {
      failures.push(`${metric}: ${actual ?? 'missing'}% (minimum ${minimum}%)`)
    }
  }
  if (failures.length) {
    throw new Error(`Coverage below threshold: ${failures.join(', ')}`)
  }
}

// Merge engine execution from both hosts; retain the browser and adapter canaries.
export function combineCoverage(
  wptData: CoverageMap | CoverageMapData,
  nodeData: CoverageMap | CoverageMapData,
  root: string,
) {
  const wpt = libCoverage.createCoverageMap(normalizeCoverageLocations(wptData))
  const node = libCoverage.createCoverageMap(
    normalizeCoverageLocations(nodeData),
  )
  const engine = path.join(root, 'src/nwsapi.js')
  const adapter = path.join(root, 'src/dom-selector.js')
  if (!wpt.files().includes(engine)) {
    throw new Error('Missing WPT engine coverage')
  }
  if (!node.files().includes(adapter)) {
    throw new Error('Missing Node adapter coverage')
  }
  for (const name of ['jquery', 'traversal']) {
    const file = path.join(root, `src/modules/nwsapi-${name}.js`)
    if (
      !node.files().includes(file) ||
      node.fileCoverageFor(file).toSummary().statements.covered === 0
    ) {
      throw new Error(`Missing Node ${name} module execution coverage`)
    }
  }
  const combined = libCoverage.createCoverageMap({})
  combined.addFileCoverage(wpt.fileCoverageFor(engine))
  combined.merge(node)
  return combined
}
