import { expect, test } from 'vitest'
import {
  coverageLocationKey,
  normalizeCoverageLocations,
} from '../../../../../scripts/repo/lib/coverage/normalize.mts'

test('coverage identity sorts object keys while preserving array execution order', () => {
  const location = {
    end: { column: Infinity, line: 2 },
    start: { line: 1, column: 0 },
  }
  const reordered = {
    start: { column: 0, line: 1 },
    end: { line: 2, column: null },
  }
  expect(coverageLocationKey(location)).toBe(coverageLocationKey(reordered))
  expect(JSON.parse(coverageLocationKey([location, null, 1]))).toEqual([
    reordered,
    null,
    1,
  ])
  expect(coverageLocationKey([1, 2])).not.toBe(coverageLocationKey([2, 1]))
})

test('normalized reports are detached and preserve finite execution counts', () => {
  const input = { position: { column: NaN, line: 1 }, counts: [0, 2] }
  const normalized = normalizeCoverageLocations(input)
  expect(normalized).toEqual({
    counts: [0, 2],
    position: { column: null, line: 1 },
  })
  normalized.counts.push(3)
  expect(input.counts).toEqual([0, 2])
  expect(Number.isNaN(input.position.column)).toBe(true)
})
