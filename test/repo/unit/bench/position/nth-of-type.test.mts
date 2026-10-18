import { expect, test } from 'vitest'
import {
  fixtures,
  parseArgs,
} from '../../../../../scripts/repo/bench/position/nth-of-type.mts'

test('generates nth-of-type cases at the requested sizes and layouts', () => {
  const entries = fixtures()
  expect(entries).toHaveLength(22)
  expect(
    entries.filter(entry => entry.id.startsWith('homogeneous-')),
  ).toHaveLength(18)
  expect(entries.map(entry => entry.id)).toContain('mixed-interleaved')
  expect(entries.map(entry => entry.id)).toContain('mixed-clustered')
  expect(entries.map(entry => entry.id)).toContain('many-parents')
  expect(entries.map(entry => entry.id)).toContain('sparse-selected')
  expect(fixtures(true)).toEqual(entries.toReversed())
})

test('validates required benchmark bundle and output arguments', () => {
  expect(() => parseArgs([])).toThrow(/required/)
  expect(() =>
    parseArgs(['--baseline', 'a', '--candidate', '--out', 'dir']),
  ).toThrow(/Usage/)
  expect(
    parseArgs([
      '--baseline',
      'a',
      '--candidate',
      'b',
      '--out',
      'dir',
      '--repeat',
    ]).repeat,
  ).toBe(true)
})
