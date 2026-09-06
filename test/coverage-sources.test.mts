import { test, expect } from 'vitest'
import path from 'node:path'
import {
  combineCoverage,
  checkCoverageThresholds,
  coverageReporters,
} from '../scripts/lib/coverage.mts'
import { coverageThresholds } from '../.config/coverage.config.mts'

const root = path.resolve('coverage-fixture')
const engine = path.join(root, 'src/nwsapi.js')
const adapter = path.join(root, 'src/dom-selector.js')
function covered(file, count) {
  return {
    [file]: {
      path: file,
      statementMap: {
        0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
      },
      s: { 0: count },
      fnMap: {},
      f: {},
      branchMap: {},
      b: {},
    },
  }
}

test('coverage uses WPT for the engine and Node for the adapter', () => {
  const map = combineCoverage(
    covered(engine, 0),
    {
      ...covered(engine, 100),
      ...covered(adapter, 1),
    },
    root,
  )
  expect(map.files().toSorted()).toEqual([adapter, engine])
  expect(map.fileCoverageFor(engine).toSummary().lines.pct).toBe(0)
  expect(map.fileCoverageFor(adapter).toSummary().lines.pct).toBe(100)
})

test('incomplete coverage cannot silently replace the combined badge', () => {
  expect(() => combineCoverage({}, covered(adapter, 1), root)).toThrow(
    'Missing WPT',
  )
  expect(() => combineCoverage(covered(engine, 1), {}, root)).toThrow(
    'Missing Node',
  )
})

test('aggregate coverage thresholds reject regressions in each metric', () => {
  const summary = {
    statements: { pct: 73 },
    branches: { pct: 61 },
    functions: { pct: 74 },
    lines: { pct: 70 },
  }
  expect(() => checkCoverageThresholds(summary)).not.toThrow()
  for (const metric of Object.keys(coverageThresholds)) {
    for (const pct of [summary[metric].pct - 0.01, NaN, Infinity, 'Unknown']) {
      expect(() =>
        checkCoverageThresholds({ ...summary, [metric]: { pct } }),
      ).toThrow(metric)
    }
  }
})

test('HTML reports are generated only in CI', () => {
  expect(coverageReporters('')).toEqual(['text', 'json', 'json-summary'])
  expect(coverageReporters('true')).toEqual([
    'text',
    'json',
    'json-summary',
    'html',
  ])
})
