import { expect, test } from 'vitest'

import {
  parseBalanceArgs,
  parseDuration,
} from '../../../../../../scripts/fleet/test/budget/balance/options.mts'

const base = ['-r', 'results.json', '--budget', '10s', '--elapsed', '69.08s']

test('accepts readable durations and keeps shard count automatic', () => {
  expect(parseBalanceArgs(base)).toEqual({
    report: 'results.json',
    budgetMs: 10_000,
    elapsedMs: 69_080,
    shards: undefined,
    top: 10,
    json: false,
  })
  expect(parseDuration('2m', '--elapsed')).toBe(120_000)
  expect(parseDuration('0.5ms', '--elapsed')).toBe(0.5)
})

test('preserves millisecond flags and parses output options', () => {
  expect(
    parseBalanceArgs([
      '--report',
      'has spaces.json',
      '--budget-ms',
      '10000',
      '--elapsed-ms',
      '69080',
      '--shards',
      '3',
      '--top',
      '4',
      '--json',
    ]),
  ).toEqual({
    report: 'has spaces.json',
    budgetMs: 10_000,
    elapsedMs: 69_080,
    shards: 3,
    top: 4,
    json: true,
  })
})

test.each(['10', '-1s', '0ms', 'Infinitys', '1e3ms', '10seconds', ' '])(
  'rejects ambiguous or invalid duration %s',
  value => {
    expect(() => parseDuration(value, '--budget')).toThrow()
  },
)

test.each([
  ['--budget-ms', '10000'],
  ['--elapsed-ms', '69080'],
  ['--shards', '0'],
  ['--shards', '1.5'],
  ['--top', '-1'],
  ['--shrad', '3'],
])('rejects conflicts and invalid options %s', (...extra) => {
  expect(() => parseBalanceArgs([...base, ...extra])).toThrow()
})

test('rejects missing report and measurement inputs', () => {
  expect(() => parseBalanceArgs([])).toThrow()
  expect(() =>
    parseBalanceArgs(['-r', 'results.json', '--budget', '10s']),
  ).toThrow()
})

test.each([
  ['500u', 0.5],
  ['500us', 0.5],
  ['0.5u', 0.0005],
  ['1h', 3_600_000],
  ['0.5h', 1_800_000],
])('converts %s to milliseconds', (value, expected) => {
  expect(parseDuration(value, '--budget')).toBe(expected)
})
