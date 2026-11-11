import { expect, test } from 'vitest'
import {
  flapCharacter,
  flipboardText,
  FLIP_TOTAL_DURATION,
} from '../../../../scripts/repo/develop/flipboard.mts'

test('matching characters never move, even midway through a cascade', () => {
  for (let time = 0; time <= FLIP_TOTAL_DURATION; time += 16) {
    const frame = flipboardText('CAT', 'CAR', time)
    expect(frame.slice(0, 2)).toBe('CA')
    expect(flapCharacter('A', 'A', time / FLIP_TOTAL_DURATION)).toBe('A')
  }
})

test('changed cells move forward through the flap sequence and settle exactly', () => {
  expect(flapCharacter('A', 'C', 0)).toBe('A')
  expect(flapCharacter('A', 'C', 0.5)).toBe('B')
  expect(flapCharacter('A', 'C', 1)).toBe('C')
  expect(flipboardText('English', 'Italiano', FLIP_TOTAL_DURATION)).toBe(
    'Italiano',
  )
})

test('the cascade advances from earlier rows to later rows', () => {
  expect(flipboardText('A', 'C', 160, 0)).toBe('B')
  expect(flipboardText('A', 'C', 160, 10)).toBe('A')
})

test('Unicode graphemes and destination word boundaries stay intact', () => {
  for (let time = 0; time <= FLIP_TOTAL_DURATION; time += 32) {
    expect(
      flipboardText('🧙 界 é\nCAT', '🧙 界 é\nCAR', time).split('\n')[0],
    ).toBe('🧙 界 é')
    expect(flipboardText('ABCDE', 'AB CD', time)[2]).toBe(' ')
  }
})
