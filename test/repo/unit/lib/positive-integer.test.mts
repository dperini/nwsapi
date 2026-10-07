import { expect, test } from 'vitest'
import { positiveInteger } from '../../../../scripts/repo/lib/positive-integer.mts'

test.each(['0', '-1', '1.5', 'NaN', 'Infinity', '10001', '9007199254740992'])(
  'rejects invalid integer %s',
  value => {
    expect(() => positiveInteger(value, 'limit')).toThrow(RangeError)
  },
)
test('accepts inclusive bounds and custom maximums', () => {
  expect(positiveInteger('1', 'limit')).toBe(1)
  expect(positiveInteger('10000', 'limit')).toBe(10_000)
  expect(positiveInteger('3', 'limit', 3)).toBe(3)
  expect(() => positiveInteger('4', 'limit', 3)).toThrow(RangeError)
})
