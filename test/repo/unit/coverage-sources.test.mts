import { test, expect } from 'vitest'
import path from 'node:path'
import {
  combineCoverage,
  checkCoverageThresholds,
  coverageReporters,
} from '../../../scripts/repo/lib/coverage.mts'
import { coverageThresholds } from '../../../.config/coverage.config.mts'

const root = path.resolve('coverage-fixture')
const engine = path.join(root, 'dist/nwsapi.js')
const adapter = path.join(root, 'dist/dom-selector.js')
const modules = ['jquery', 'legacy', 'traversal'].map(name =>
  path.join(root, `dist/modules/nwsapi-${name}.js`),
)
const moduleCoverage = Object.assign(
  {},
  ...modules.map(file => covered(file, 1)),
)
function covered(file: string, count: number) {
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

test('coverage merges browser and Node engine execution and includes the adapter', () => {
  const map = combineCoverage(
    covered(engine, 0),
    {
      ...covered(engine, 100),
      ...covered(adapter, 1),
      ...moduleCoverage,
    },
    root,
  )
  expect(map.files().toSorted()).toEqual(
    [adapter, engine, ...modules].toSorted(),
  )
  expect(map.fileCoverageFor(engine).toSummary().lines.pct).toBe(100)
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
    statements: { pct: coverageThresholds.statements },
    branches: { pct: coverageThresholds.branches },
    functions: { pct: coverageThresholds.functions },
    lines: { pct: coverageThresholds.lines },
  }
  expect(() => checkCoverageThresholds(summary)).not.toThrow()
  for (const metric of Object.keys(coverageThresholds) as Array<
    keyof typeof coverageThresholds
  >) {
    for (const pct of [
      summary[metric].pct - 0.01,
      NaN,
      Infinity,
      'Unknown',
    ] as const) {
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

test('in-memory browser endpoints merge with JSON-serialized Node endpoints exactly once', () => {
  const browser = covered(engine, 0)
  browser[engine]!.statementMap[0].end.column = Infinity
  const node = JSON.parse(JSON.stringify(covered(engine, 1)))
  node[engine].statementMap[0].end.column = null
  const map = combineCoverage(
    browser,
    { ...node, ...covered(adapter, 1), ...moduleCoverage },
    root,
  )
  expect(map.fileCoverageFor(engine).toSummary().statements).toMatchObject({
    total: 1,
    covered: 1,
    pct: 100,
  })
})

test('optional modules must contribute execution to the combined report', () => {
  for (const file of modules) {
    for (const empty of [true, false] as const) {
      const node = { ...covered(adapter, 1), ...moduleCoverage }
      if (empty) {
        delete node[file]
      } else {
        Object.assign(node, covered(file, 0))
      }
      expect(() => combineCoverage(covered(engine, 1), node, root)).toThrow(
        'module execution coverage',
      )
    }
  }
})
