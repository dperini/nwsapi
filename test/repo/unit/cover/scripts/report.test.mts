import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import { expect, test } from 'vitest'
import {
  collectScriptCoverage,
  writeScriptCoverage,
  checkScriptCoverage,
} from '../../../../../scripts/repo/cover/scripts/report.mts'
import { unexecutedScriptCoverage } from '../../../../../scripts/repo/cover/scripts/native.mts'
import { executeFixture, fixture } from './fixture/input.mts'

test('collection merges Node subprocesses and both test tiers while retaining untested files', async () => {
  const input = fixture()
  executeFixture(input)
  const unused = path.join(input.root, 'scripts/unused.mts')
  writeFileSync(unused, 'export function unused() { return 1 }\n')
  const tierData = await unexecutedScriptCoverage(input.entry)
  for (const tier of ['unit', 'integration']) {
    writeFileSync(
      path.join(input.directory, tier, 'coverage-final.json'),
      JSON.stringify(tierData),
    )
  }
  const { coverage, inventory } = await collectScriptCoverage(
    input.root,
    input.directory,
  )
  expect(inventory.node).toEqual([input.entry, unused])
  expect(coverage.fileCoverageFor(input.entry).toSummary().lines.pct).toBe(100)
  expect(coverage.fileCoverageFor(unused).toSummary().lines.pct).toBe(0)
  const summary = writeScriptCoverage(coverage, input.directory)
  expect(
    JSON.parse(
      readFileSync(path.join(input.directory, 'coverage-summary.json'), 'utf8'),
    ).total,
  ).toEqual(summary)
  expect(
    JSON.parse(
      readFileSync(path.join(input.directory, 'gaps.json'), 'utf8'),
    ).map((item: { file: string }) => item.file),
  ).toEqual([unused])
  expect(() => checkScriptCoverage(coverage)).toThrow(
    expect.objectContaining({ code: 'ERR_SCRIPT_COVERAGE', minimum: 98 }),
  )
  const second = path.join(input.root, 'scripts/unused2.mts')
  writeFileSync(second, 'export function unused2() { return 2 }\n')
  coverage.merge(await unexecutedScriptCoverage(second))
  writeScriptCoverage(coverage, input.directory)
  expect(
    JSON.parse(readFileSync(path.join(input.directory, 'gaps.json'), 'utf8')),
  ).toHaveLength(2)
})

test('the threshold accepts a fully exercised map and writes an empty gap list', async () => {
  const input = fixture()
  executeFixture(input)
  for (const tier of ['unit', 'integration']) {
    writeFileSync(path.join(input.directory, tier, 'coverage-final.json'), '{}')
  }
  const { coverage } = await collectScriptCoverage(input.root, input.directory)
  expect(() => checkScriptCoverage(coverage)).not.toThrow()
  expect(writeScriptCoverage(coverage, input.directory).lines.pct).toBe(100)
  expect(
    JSON.parse(readFileSync(path.join(input.directory, 'gaps.json'), 'utf8')),
  ).toEqual([])
  expect(() => checkScriptCoverage(libCoverage.createCoverageMap({}))).toThrow(
    expect.objectContaining({ code: 'ERR_SCRIPT_COVERAGE_EMPTY' }),
  )
})
