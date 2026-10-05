import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  instrumentedVariants,
  variants,
} from '../../../../../../scripts/repo/bench/planner/has/variants.mts'
import {
  jsdomEvidence,
  browserEvidence,
} from '../../../../../../scripts/repo/bench/planner/has/evidence.mts'
import { routeBundle } from '../../../../../../scripts/repo/bench/planner/has/instrument.mts'
import { fixtures } from '../../../../../../scripts/repo/bench/planner/has/fixtures.mts'

const entries = fixtures().filter(entry =>
  [
    'flat-32-4-plain',
    'flat-32-4-filtered',
    'flat-32-0-plain',
    'flat-192-4-plain',
    'small-8-4-plain',
  ].includes(entry.id),
)

test('forced routes execute different algorithms and return identical ordered results', () => {
  const evidence = jsdomEvidence(entries, instrumentedVariants())
  const dense = evidence.find(row => row.id === 'flat-32-4-plain')!
  expect(dense.traces.map(trace => trace.route)).toEqual([
    'inverse',
    'forward',
    'inverse',
  ])
  const filtered = evidence.find(row => row.id === 'flat-32-4-filtered')!
  expect(filtered.traces.map(trace => trace.route)).toEqual([
    'forward',
    'forward',
    'inverse',
  ])
})

test('baseline bytes are preserved and ambiguous builds fail closed', () => {
  const baseline = readFileSync(
    new URL('../../../../../../dist/nwsapi.js', import.meta.url),
    'utf8',
  )
  expect(variants()[0]).toBe(baseline)
  expect(() => routeBundle(baseline + '\nfunction selectBulkHas() {}')).toThrow(
    'selectBulkHas function',
  )
  expect(() => routeBundle('function selectBulkHas() {}')).toThrow(
    'routing condition',
  )
})

test('native Chromium confirms actual route identities', async () => {
  const evidence = await browserEvidence(entries, instrumentedVariants())
  expect(evidence).toHaveLength(entries.length)
}, 30_000)
