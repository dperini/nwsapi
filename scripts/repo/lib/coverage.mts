import path from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import { coverageThresholds } from '../../../.config/coverage.config.mts'

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

// Merge hit counts for the same source locations, not report percentages.
export function combineCoverage(wptData, nodeData, root) {
  // V8's end-of-line column is Infinity. JSON reports encode it as null;
  // restore it so persisted Node maps match in-memory browser locations.
  const restore = data =>
    libCoverage.createCoverageMap(
      JSON.parse(JSON.stringify(data), (key, value) =>
        key === 'column' && value === null ? Infinity : value,
      ),
    )
  const wpt = restore(wptData)
  const node = restore(nodeData)
  const engine = path.join(root, 'src/nwsapi.js')
  const adapter = path.join(root, 'src/dom-selector.js')
  if (!wpt.files().includes(engine)) {
    throw new Error('Missing WPT engine coverage')
  }
  if (!node.files().includes(adapter)) {
    throw new Error('Missing Node adapter coverage')
  }
  if (!node.files().includes(engine)) {
    throw new Error('Missing Node engine coverage')
  }
  for (const key of ['statementMap', 'fnMap', 'branchMap']) {
    const locations = file =>
      JSON.stringify(
        Object.values(file[key])
          .map(value => JSON.stringify(value))
          .toSorted(),
      )
    if (
      locations(wpt.fileCoverageFor(engine)) !==
      locations(node.fileCoverageFor(engine))
    ) {
      throw new Error(
        `Incompatible engine coverage ${key}: rebuild and rerun both suites`,
      )
    }
  }
  const combined = libCoverage.createCoverageMap({})
  combined.addFileCoverage(wpt.fileCoverageFor(engine))
  combined.addFileCoverage(node.fileCoverageFor(engine))
  combined.addFileCoverage(node.fileCoverageFor(adapter))
  return combined
}
