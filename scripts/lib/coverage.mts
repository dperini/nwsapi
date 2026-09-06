import path from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import { coverageThresholds } from '../../.config/coverage.config.mts'

export function coverageReporters(ci = process.env.CI) {
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

// Browser engine coverage and Node adapter coverage have separate owners.
export function combineCoverage(wptData, nodeData, root) {
  const wpt = libCoverage.createCoverageMap(wptData)
  const node = libCoverage.createCoverageMap(nodeData)
  const engine = path.join(root, 'src/nwsapi.js')
  const adapter = path.join(root, 'src/dom-selector.js')
  if (!wpt.files().includes(engine)) {
    throw new Error('Missing WPT engine coverage')
  }
  if (!node.files().includes(adapter)) {
    throw new Error('Missing Node adapter coverage')
  }
  const combined = libCoverage.createCoverageMap({})
  combined.addFileCoverage(wpt.fileCoverageFor(engine))
  combined.addFileCoverage(node.fileCoverageFor(adapter))
  return combined
}
