import { expect, test } from 'vitest'
import { resolveSamplingInterval } from '../../../../../scripts/repo/bench/allocation-profile/options.mts'

test('allocation interval has a byte default and preserves its alias', () => {
  expect(resolveSamplingInterval()).toBe(512)
  expect(resolveSamplingInterval('1024')).toBe(1024)
  expect(resolveSamplingInterval(undefined, '256')).toBe(256)
})

test('allocation interval rejects conflicts and out-of-range values', () => {
  expect(() => resolveSamplingInterval('512', '512')).toThrow()
  expect(() => resolveSamplingInterval('0')).toThrow()
  expect(() => resolveSamplingInterval('32769')).toThrow()
  expect(() => resolveSamplingInterval('1ms')).toThrow()
})
