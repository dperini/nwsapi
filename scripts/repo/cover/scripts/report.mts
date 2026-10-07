import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'
import type { CoverageMap, CoverageMapData } from 'istanbul-lib-coverage'
import { scriptInventory } from './inventory.mts'
import { nativeScriptCoverage, unexecutedScriptCoverage } from './native.mts'

export const SCRIPT_COVERAGE_MINIMUM = 98
const metrics = ['lines', 'statements', 'functions', 'branches'] as const

export async function collectScriptCoverage(root: string, directory: string) {
  const coverage = libCoverage.createCoverageMap({})
  const tiers = ['unit', 'integration']
  for (let i = 0, length = tiers.length; i < length; i += 1) {
    coverage.merge(
      JSON.parse(
        readFileSync(
          path.join(directory, tiers[i]!, 'coverage-final.json'),
          'utf8',
        ),
      ) as CoverageMapData,
    )
  }
  coverage.merge(
    await nativeScriptCoverage(
      root,
      path.join(directory, 'raw'),
      path.join(directory, 'transformed'),
    ),
  )
  const inventory = scriptInventory(root)
  const owned = new Set(inventory.node)
  coverage.filter(file => owned.has(file))
  const included = new Set(coverage.files())
  for (let i = 0, length = inventory.node.length; i < length; i += 1) {
    const file = inventory.node[i]!
    if (!included.has(file)) {
      coverage.merge(await unexecutedScriptCoverage(file))
    }
  }
  return { coverage, inventory }
}

export function writeScriptCoverage(coverage: CoverageMap, directory: string) {
  const context = libReport.createContext({
    dir: directory,
    coverageMap: coverage,
  })
  const formats = ['json', 'json-summary', 'html'] as const
  for (let i = 0, length = formats.length; i < length; i += 1) {
    reports.create(formats[i]!).execute(context)
  }
  const gaps = coverage
    .files()
    .map(file => ({
      file,
      summary: coverage.fileCoverageFor(file).toSummary().toJSON(),
    }))
    .filter(item =>
      metrics.some(
        metric => item.summary[metric].pct < SCRIPT_COVERAGE_MINIMUM,
      ),
    )
    .toSorted((a, b) => a.summary.lines.pct - b.summary.lines.pct)
  writeFileSync(
    path.join(directory, 'gaps.json'),
    JSON.stringify(gaps, null, 2) + '\n',
  )
  return coverage.getCoverageSummary().toJSON()
}

export function checkScriptCoverage(coverage: CoverageMap) {
  if (coverage.files().length === 0) {
    throw Object.assign(new Error('Repository script coverage is empty.'), {
      code: 'ERR_SCRIPT_COVERAGE_EMPTY',
    })
  }
  const failures = coverage.files().flatMap(file => {
    const summary = coverage.fileCoverageFor(file).toSummary()
    return metrics
      .filter(metric => summary[metric].pct < SCRIPT_COVERAGE_MINIMUM)
      .map(metric => ({ file, metric, actual: summary[metric].pct }))
  })
  if (failures.length) {
    throw Object.assign(
      new Error('Repository script coverage is below the required minimum.'),
      {
        code: 'ERR_SCRIPT_COVERAGE',
        minimum: SCRIPT_COVERAGE_MINIMUM,
        failures,
      },
    )
  }
}
