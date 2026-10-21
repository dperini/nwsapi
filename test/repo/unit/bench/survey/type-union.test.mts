import { expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { JSDOM } from 'jsdom'
import {
  measureTypeUnions,
  parseOptions,
  readBundle,
  typeUnionFixtures,
} from '../../../../../scripts/repo/bench/survey/type-union.mts'

const measurement = vi.hoisted(() => ({
  browser: vi.fn().mockResolvedValue({ version: 'fixture', rows: [] }),
  jsdom: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../../../../scripts/repo/bench/planner/measure.mts', () => ({
  measureBrowser: measurement.browser,
  measureJsdom: measurement.jsdom,
  settings: {},
}))
vi.mock('../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => 'fixture AC power',
}))

test('duplicate and unique terminal unions have the same native identities in each document shape', () => {
  const entries = typeUnionFixtures()
  for (const entry of entries.filter(value =>
    value.selector.includes(':where(a, code, a, code)'),
  )) {
    const { window } = new JSDOM(entry.html)
    try {
      expect(
        Array.from(window.document.querySelectorAll(entry.selector)),
        entry.id,
      ).toEqual(
        Array.from(window.document.querySelectorAll('dl dd :is(a, code)')),
      )
    } finally {
      window.close()
    }
  }
  const empty = entries.find(entry => entry.id.startsWith('empty/'))!
  const { window } = new JSDOM(empty.html)
  try {
    expect(window.document.querySelectorAll(empty.selector)).toHaveLength(0)
  } finally {
    window.close()
  }
})

test('bundle comparison requires explicit input and output paths', () => {
  expect(() => parseOptions([])).toThrow(/--baseline/)
  expect(() => parseOptions(['--unknown'])).toThrow()
  const result = parseOptions([
    '--baseline',
    'baseline.cjs.gz',
    '--candidate',
    'candidate.cjs.gz',
    '--output',
    'results',
    '--repeat',
  ])
  expect(path.basename(result.baseline)).toBe('baseline.cjs.gz')
  expect(path.basename(result.candidate)).toBe('candidate.cjs.gz')
  expect(result.repeat).toBe(true)
})

test('measurement archives the exact inputs, reverses both orders, and refuses to overwrite', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-union-bench-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const baseline = path.join(directory, 'baseline.cjs')
  const candidate = path.join(directory, 'candidate.cjs.gz')
  writeFileSync(baseline, 'baseline fixture')
  writeFileSync(candidate, gzipSync('candidate fixture'))
  expect(readBundle(baseline)).toBe('baseline fixture')
  expect(readBundle(candidate)).toBe('candidate fixture')
  const output = path.join(directory, 'repeat')
  const options = {
    baseline,
    candidate,
    output,
    repeat: true,
    expanded: false,
    rounds: 9,
  }
  await measureTypeUnions(options)
  const entries = typeUnionFixtures().toReversed()
  expect(measurement.browser).toHaveBeenLastCalledWith(entries, [
    'candidate fixture',
    'baseline fixture',
  ])
  expect(measurement.jsdom).toHaveBeenLastCalledWith(entries, [
    'candidate fixture',
    'baseline fixture',
  ])
  expect(readBundle(path.join(output, 'baseline.cjs.gz'))).toBe(
    'baseline fixture',
  )
  expect(readBundle(path.join(output, 'candidate.cjs.gz'))).toBe(
    'candidate fixture',
  )
  expect(
    JSON.parse(
      gunzipSync(
        readFileSync(path.join(output, 'fixtures.json.gz')),
      ).toString(),
    ),
  ).toEqual(entries)
  const recorded = JSON.parse(
    readFileSync(path.join(output, 'chromium.json'), 'utf8'),
  )
  expect(recorded.metadata.labels).toEqual(['candidate', 'baseline'])
  expect(recorded.metadata.powerBefore).toBe('fixture AC power')
  expect(recorded.metadata.powerAfter).toBe('fixture AC power')
  const calls = measurement.browser.mock.calls.length
  await expect(measureTypeUnions(options)).rejects.toThrow(
    /new type-union output directory/,
  )
  expect(measurement.browser).toHaveBeenCalledTimes(calls)
})

test('expanded comparisons keep focused controls and add distinct workloads across documents', () => {
  const focused = typeUnionFixtures()
  const expanded = typeUnionFixtures(true)
  expect(expanded.slice(0, focused.length)).toEqual(focused)
  const ids = new Set(expanded.map(entry => entry.id))
  expect(ids.size).toBe(expanded.length)
  expect(ids.has('components/input:read-only')).toBe(true)
  expect(ids.has('atomic/.sidebar .row .link')).toBe(true)
  expect(ids.has('mixed/.deep .target')).toBe(true)
  const options = parseOptions([
    '--baseline',
    'before',
    '--candidate',
    'after',
    '--output',
    'results',
    '--expanded',
    '--rounds',
    '5',
  ])
  expect(options.expanded).toBe(true)
  expect(options.rounds).toBe(5)
})
