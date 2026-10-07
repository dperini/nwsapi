import libCoverage from 'istanbul-lib-coverage'
import type { CoverageMapData, Range } from 'istanbul-lib-coverage'
import { expect, test } from 'vitest'
import { mergeScriptCoverage } from '../../../../../scripts/repo/cover/scripts/merge.mts'

const range = (
  line: number,
  column: number,
  endLine = line,
  endColumn = 99,
): Range => ({
  start: { line, column },
  end: { line: endLine, column: endColumn },
})
function report(endColumn: number, hits: number): CoverageMapData {
  return {
    '/fixture.mts': {
      path: '/fixture.mts',
      statementMap: { 0: range(3, 2, 5, endColumn) },
      fnMap: {
        0: {
          name: 'fixture',
          decl: range(1, 0),
          loc: range(2, 0, 7, endColumn),
          line: 1,
        },
      },
      branchMap: {
        0: {
          type: 'binary-expr',
          line: 3,
          loc: range(3, 2, 5, endColumn),
          locations: [range(3, 2, 3, endColumn), range(4, 4, 5, endColumn)],
        },
      },
      s: { 0: hits },
      f: { 0: hits },
      b: { 0: [hits, hits] },
    },
  }
}

test('source-mapped and native endpoints merge into one execution inventory while adding all hits', () => {
  const unit = report(Number.POSITIVE_INFINITY, 3)
  const native = report(12, 2)
  native['/fixture.mts']!.statementMap['0']!.end.line = 6
  native['/fixture.mts']!.fnMap['0']!.decl = range(1, 8)
  const before = structuredClone(native)
  const coverage = libCoverage.createCoverageMap(unit)
  mergeScriptCoverage(coverage, native)
  const merged = coverage.fileCoverageFor('/fixture.mts')
  expect(merged.s).toEqual({ 0: 5 })
  expect(merged.f).toEqual({ 0: 5 })
  expect(merged.b).toEqual({ 0: [5, 5] })
  expect(merged.toSummary().branches.pct).toBe(100)
  expect(native).toEqual(before)
})

test('a never-executed native process cannot dilute fully exercised unit branches', () => {
  const coverage = libCoverage.createCoverageMap(
    report(Number.POSITIVE_INFINITY, 1),
  )
  mergeScriptCoverage(coverage, libCoverage.createCoverageMap(report(12, 0)))
  expect(coverage.getCoverageSummary().branches).toMatchObject({
    total: 2,
    covered: 2,
    pct: 100,
  })
})

test('branches with different entry paths retain independent counts', () => {
  const coverage = libCoverage.createCoverageMap(report(12, 1))
  const incoming = report(15, 0)
  incoming['/fixture.mts']!.branchMap['0']!.locations[1]!.start.column = 8
  mergeScriptCoverage(coverage, incoming)
  expect(
    Object.keys(coverage.fileCoverageFor('/fixture.mts').branchMap),
  ).toHaveLength(2)
  expect(coverage.getCoverageSummary().branches.pct).toBe(50)
})

test('ambiguous starts remain separate rather than incorrectly lending execution to another statement', () => {
  const coverage = libCoverage.createCoverageMap(report(12, 1))
  const incoming = report(15, 0)
  incoming['/fixture.mts']!.statementMap['1'] = range(3, 2, 8)
  incoming['/fixture.mts']!.s['1'] = 0
  mergeScriptCoverage(coverage, incoming)
  expect(
    Object.keys(coverage.fileCoverageFor('/fixture.mts').statementMap),
  ).toHaveLength(3)
  expect(coverage.getCoverageSummary().statements.pct).toBe(33.33)
})

test('ambiguous reference identities are never selected for alignment', () => {
  const original = report(12, 1)
  original['/fixture.mts']!.statementMap['1'] = range(3, 2, 8)
  original['/fixture.mts']!.s['1'] = 0
  const coverage = libCoverage.createCoverageMap(original)
  mergeScriptCoverage(coverage, report(15, 0))
  expect(
    Object.keys(coverage.fileCoverageFor('/fixture.mts').statementMap),
  ).toHaveLength(3)
})

test('new file inventories and empty reports merge without fabricating hits', () => {
  const coverage = libCoverage.createCoverageMap({})
  mergeScriptCoverage(coverage, report(12, 0))
  mergeScriptCoverage(coverage, {})
  expect(coverage.files()).toEqual(['/fixture.mts'])
  expect(coverage.getCoverageSummary().lines.pct).toBe(0)
})
