import { test, expect } from 'vitest'
import path from 'node:path'
import {
  combineCoverage,
  checkCoverageThresholds,
  coverageReporters,
} from '../../../scripts/repo/lib/coverage.mts'
import { coverageThresholds } from '../../../.config/coverage.config.mts'

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

test('coverage includes engine lines reached only by Node tests', () => {
  const map = combineCoverage(
    covered(engine, 0),
    {
      ...covered(engine, 100),
      ...covered(adapter, 1),
    },
    root,
  )
  expect(map.files().toSorted()).toEqual([adapter, engine])
  expect(map.fileCoverageFor(engine).toSummary().lines.pct).toBe(100)
  expect(map.fileCoverageFor(adapter).toSummary().lines.pct).toBe(100)
})

test('coverage preserves WPT hits and adds Node hits without duplicate files', () => {
  const map = combineCoverage(
    covered(engine, 2),
    { ...covered(engine, 3), ...covered(adapter, 1) },
    root,
  )
  expect(map.files().toSorted()).toEqual([adapter, engine])
  expect(map.fileCoverageFor(engine).s).toEqual({ 0: 5 })
  const browserOnly = combineCoverage(
    covered(engine, 2),
    { ...covered(engine, 0), ...covered(adapter, 1) },
    root,
  )
  expect(browserOnly.fileCoverageFor(engine).toSummary().lines.pct).toBe(100)
})

test('incomplete coverage cannot silently replace the combined badge', () => {
  expect(() => combineCoverage({}, covered(adapter, 1), root)).toThrow(
    'Missing WPT',
  )
  expect(() => combineCoverage(covered(engine, 1), {}, root)).toThrow(
    'Missing Node',
  )
  expect(() =>
    combineCoverage(covered(engine, 1), covered(adapter, 1), root),
  ).toThrow('Missing Node engine coverage')
})

test('incompatible source locations cannot inflate the aggregate', () => {
  const node = covered(engine, 1)
  node[engine].statementMap[0].start.line = 2
  expect(() =>
    combineCoverage(
      covered(engine, 1),
      { ...node, ...covered(adapter, 1) },
      root,
    ),
  ).toThrow('Incompatible engine coverage statementMap')
})

test('counter IDs do not have to match between runners', () => {
  const node = covered(engine, 2)
  Object.assign(node[engine], {
    statementMap: { 8: node[engine].statementMap[0] },
    s: { 8: 2 },
  })
  const file = combineCoverage(
    covered(engine, 1),
    { ...node, ...covered(adapter, 1) },
    root,
  ).fileCoverageFor(engine)
  expect(Object.keys(file.statementMap)).toHaveLength(1)
  expect(Object.values(file.s)).toEqual([3])
  expect(node[engine].s).toEqual({ 8: 2 })
})

test('persisted end-of-line columns do not duplicate shared statements', () => {
  const wpt = covered(engine, 1)
  wpt[engine].statementMap[0].end.column = Infinity
  const node = JSON.parse(JSON.stringify(wpt))
  node[engine].s[0] = 2
  const map = combineCoverage(wpt, { ...node, ...covered(adapter, 1) }, root)
  const file = map.fileCoverageFor(engine)
  expect(Object.keys(file.statementMap)).toHaveLength(1)
  expect(file.s).toEqual({ 0: 3 })
})

test('complementary branches and functions count once across runners', () => {
  const wpt = covered(engine, 0)
  const location = wpt[engine].statementMap[0]
  Object.assign(wpt[engine], {
    fnMap: { 0: { name: 'example', decl: location, loc: location, line: 1 } },
    f: { 0: 0 },
    branchMap: {
      0: {
        type: 'if',
        loc: location,
        locations: [location, location],
        line: 1,
      },
    },
    b: { 0: [1, 0] },
  })
  const node = structuredClone(wpt)
  Object.assign(node[engine], { s: { 0: 1 }, f: { 0: 1 }, b: { 0: [0, 1] } })
  const file = combineCoverage(
    wpt,
    { ...node, ...covered(adapter, 1) },
    root,
  ).fileCoverageFor(engine)
  expect(file.toSummary().functions).toMatchObject({
    total: 1,
    covered: 1,
    pct: 100,
  })
  expect(file.toSummary().branches).toMatchObject({
    total: 2,
    covered: 2,
    pct: 100,
  })
  expect(file.toSummary().statements).toMatchObject({
    total: 1,
    covered: 1,
    pct: 100,
  })
})

test('aggregate coverage thresholds reject regressions in each metric', () => {
  const summary = {
    statements: { pct: coverageThresholds.statements },
    branches: { pct: coverageThresholds.branches },
    functions: { pct: coverageThresholds.functions },
    lines: { pct: coverageThresholds.lines },
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
