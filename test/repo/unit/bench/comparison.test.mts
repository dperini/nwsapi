import { expect, test } from 'vitest'
import { compareBenchmarkRounds } from '../../../../scripts/fleet/bench/comparison.mts'

test('pairs by round ID while preserving baseline order and source measurements', () => {
  const baseline = Object.freeze([
    Object.freeze({ round: 'first', cost: 10 }),
    Object.freeze({ round: 'second', cost: 100 }),
    Object.freeze({ round: 'third', cost: 1000 }),
  ])
  const candidate = Object.freeze([
    Object.freeze({ round: 'third', cost: 900 }),
    Object.freeze({ round: 'first', cost: 20 }),
    Object.freeze({ round: 'second', cost: 50 }),
  ])
  const result = compareBenchmarkRounds(baseline, candidate)
  expect(result.rounds).toEqual([
    {
      round: 'first',
      baseline: 10,
      candidate: 20,
      absoluteChange: 10,
      relativeChange: 1,
    },
    {
      round: 'second',
      baseline: 100,
      candidate: 50,
      absoluteChange: -50,
      relativeChange: -0.5,
    },
    {
      round: 'third',
      baseline: 1000,
      candidate: 900,
      absoluteChange: -100,
      relativeChange: -0.1,
    },
  ])
  expect(result.baseline).toEqual({ count: 3, min: 10, median: 100, max: 1000 })
  expect(result.candidate).toEqual({ count: 3, min: 20, median: 50, max: 900 })
  expect(result.absoluteChange).toEqual({
    count: 3,
    min: -100,
    median: -50,
    max: 10,
  })
  expect(result.relativeChange).toEqual({
    count: 3,
    min: -0.5,
    median: -0.1,
    max: 1,
  })
  expect(result.candidate.median / result.baseline.median - 1).toBe(-0.5)
  expect(baseline.map(row => row.cost)).toEqual([10, 100, 1000])
  expect(candidate.map(row => row.round)).toEqual(['third', 'first', 'second'])
})

test('summarizes even counts and identical-build controls without a verdict', () => {
  const baseline = [
    { round: 0, cost: 10 },
    { round: 1, cost: 30 },
  ]
  const candidate = [
    { round: 0, cost: 12 },
    { round: 1, cost: 27 },
  ]
  const control = compareBenchmarkRounds(baseline, candidate)
  expect(control.baseline).toEqual({ count: 2, min: 10, median: 20, max: 30 })
  expect(control.candidate).toEqual({
    count: 2,
    min: 12,
    median: 19.5,
    max: 27,
  })
  expect(control.absoluteChange.median).toBe(-0.5)
  expect(control.relativeChange.median).toBeCloseTo(0.05)
  const identical = compareBenchmarkRounds(baseline, baseline)
  expect(identical.relativeChange).toEqual({
    count: 2,
    min: 0,
    median: 0,
    max: 0,
  })
})

test('supports one round and distinct numeric and string IDs', () => {
  const single = [{ round: 'only', cost: 7 }]
  expect(compareBenchmarkRounds(single, single).baseline).toEqual({
    count: 1,
    min: 7,
    median: 7,
    max: 7,
  })
  const distinct = [
    { round: 1, cost: 2 },
    { round: '1', cost: 4 },
  ]
  expect(compareBenchmarkRounds(distinct, distinct).rounds).toHaveLength(2)
})

test('keeps finite medians for extreme positive costs', () => {
  for (const cost of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const measurements = [
      { round: 0, cost },
      { round: 1, cost },
    ]
    expect(
      compareBenchmarkRounds(measurements, measurements).baseline.median,
    ).toBe(cost)
  }
})

test.each([0, -1, NaN, Infinity, -Infinity])(
  'rejects invalid cost %s on either side',
  cost => {
    const valid = [{ round: 'first', cost: 1 }]
    const invalid = [{ round: 'first', cost }]
    expect(() => compareBenchmarkRounds(invalid, valid)).toThrow(RangeError)
    expect(() => compareBenchmarkRounds(valid, invalid)).toThrow(RangeError)
  },
)

test.each(['', ' ', NaN, Infinity])('rejects invalid round ID %s', round => {
  const measurements = [{ round, cost: 1 }]
  expect(() => compareBenchmarkRounds(measurements, measurements)).toThrow(
    RangeError,
  )
})

test('rejects missing, duplicated, and mismatched rounds', () => {
  const baseline = [{ round: 'first', cost: 1 }]
  const duplicate = [...baseline, ...baseline]
  const other = [{ round: 'second', cost: 1 }]
  for (const options of [
    { baseline: [], candidate: baseline },
    { baseline, candidate: [] },
    { baseline: duplicate, candidate: baseline },
    { baseline, candidate: duplicate },
    { baseline, candidate: other },
    { baseline, candidate: [...baseline, ...other] },
  ]) {
    expect(() =>
      compareBenchmarkRounds(options.baseline, options.candidate),
    ).toThrow(RangeError)
  }
})

test('rejects relative changes outside finite numeric range', () => {
  expect(() =>
    compareBenchmarkRounds(
      [{ round: 0, cost: Number.MIN_VALUE }],
      [{ round: 0, cost: Number.MAX_VALUE }],
    ),
  ).toThrow(RangeError)
})
