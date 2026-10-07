import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import { expect, test } from 'vitest'
import {
  nativeProcessMarker,
  nativeScriptCoverage,
  unexecutedScriptCoverage,
} from '../../../../../scripts/repo/cover/scripts/native.mts'
import { executeFixture, fixture } from './fixture/input.mts'

test('process markers identify the PID and worker, not the timestamp', () => {
  expect(nativeProcessMarker('coverage-123-9999-2.json')).toBe('123-2.json')
  expect(nativeProcessMarker('coverage-123-9999-0.json')).toBe('123-0.json')
  expect(nativeProcessMarker('other.json')).toBeUndefined()
})

test('native Node execution is converted with the original TypeScript offsets', async () => {
  const input = fixture()
  executeFixture(input)
  const raw = path.join(input.directory, 'raw')
  const name = readdirSync(raw)[0]!
  const report = JSON.parse(readFileSync(path.join(raw, name), 'utf8'))
  report.result.push(
    { url: 'node:test', functions: [] },
    {
      url: new URL('./sample.json', 'file://' + input.entry).href,
      functions: [],
    },
  )
  writeFileSync(path.join(raw, name), JSON.stringify(report))
  writeFileSync(path.join(raw, 'notes.json'), '{}')
  writeFileSync(
    path.join(raw, 'coverage-123-9999-0.json'),
    JSON.stringify(report),
  )
  const result = await nativeScriptCoverage(
    input.root,
    raw,
    path.join(input.directory, 'transformed'),
  )
  expect(result.files()).toEqual([input.entry])
  expect(result.getCoverageSummary().lines.pct).toBe(100)
  const markers = readdirSync(raw)
    .map(nativeProcessMarker)
    .filter(marker => marker !== undefined)
  markers.forEach(marker =>
    writeFileSync(path.join(input.directory, 'transformed', marker), '{}'),
  )
  expect(
    (
      await nativeScriptCoverage(
        input.root,
        raw,
        path.join(input.directory, 'transformed'),
      )
    ).files(),
  ).toEqual([])
})

test('unexecuted JavaScript and TypeScript retain zero-hit executable statements', async () => {
  const input = fixture()
  for (const extension of ['mjs', 'js', 'mts']) {
    const file = path.join(input.root, `scripts/unused.${extension}`)
    writeFileSync(file, 'export function unused(value) { return value + 1 }\n')
    const result = libCoverage.createCoverageMap(
      await unexecutedScriptCoverage(file),
    )
    expect(result.files()).toEqual([file])
    expect(result.getCoverageSummary().lines.pct).toBe(0)
    expect(result.getCoverageSummary().functions.pct).toBe(0)
  }
})
