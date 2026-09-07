import { expect, test } from 'vitest'
import { replaceCacheLimit } from '../../../scripts/repo/bench/cache-source.mts'
import { median, measure } from '../../../scripts/repo/bench/timing.mts'
import { world } from '../../../scripts/repo/bench/world.mts'

test('cache sweep replaces exactly one assignment and rejects stale anchors', () => {
  const source = '\nvar CACHE_LIMIT = 1000,\n  next = 1;'
  expect(replaceCacheLimit(source, 4096)).toBe(
    '\nvar CACHE_LIMIT = 4096,\n  next = 1;',
  )
  expect(() => replaceCacheLimit('CACHE_LIMIT changed', 4096)).toThrow()
  expect(() => replaceCacheLimit(source + source, 4096)).toThrow()
  expect(() => replaceCacheLimit(source, 0)).toThrow(RangeError)
  expect(
    replaceCacheLimit(
      'var note = "CACHE_LIMIT = 9,"; var CACHE_LIMIT=1000;',
      8,
    ),
  ).toBe('var note = "CACHE_LIMIT = 9,"; var CACHE_LIMIT=8;')
})

test('timing retains samples and invokes every runner in each round', () => {
  const samples = [3, 1, 2]
  expect(median(samples)).toBe(2)
  expect(samples).toEqual([3, 1, 2])
  let calls = 0
  const result = measure(
    [
      () => {
        calls++
      },
      () => {
        calls++
      },
    ],
    3,
    2,
  )
  expect(calls).toBe(18)
  expect(result).toHaveLength(2)
  expect(result.every(value => value >= 0)).toBe(true)
})

test('benchmark worlds keep independent document state', () => {
  const first = world('<!doctype html><p id=a></p>')
  const second = world('<!doctype html><p id=b></p>')
  try {
    expect(first.engines.nwsapi.select('p', first.document)[0].id).toBe('a')
    expect(second.engines.nwsapi.select('p', second.document)[0].id).toBe('b')
    const count = first.elements
    first.touch()
    expect(first.all().length).toBe(count)
  } finally {
    first.dom.window.close()
    second.dom.window.close()
  }
})
