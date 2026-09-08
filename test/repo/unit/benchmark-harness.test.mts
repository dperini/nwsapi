import { expect, test } from 'vitest'
import { replaceCacheLimit } from '../../../scripts/repo/bench/cache-source.mts'
import {
  median,
  measure,
  sampleFresh,
} from '../../../scripts/repo/bench/timing.mts'
import { world } from '../../../scripts/repo/bench/world.mts'
import { cases } from '../../../scripts/repo/bench/cases.mts'
import { DOCUMENTS } from '../../../scripts/repo/bench/documents.mts'

test('practical query groups exercise nonempty results in their own fixtures', () => {
  for (const fixture of ['components', 'documentation', 'atomic']) {
    const subject = world(DOCUMENTS[fixture].html())
    try {
      expect(cases[fixture][fixture]).toHaveLength(4)
      for (const selector of cases[fixture][fixture]) {
        const expected = Array.from(subject.document.querySelectorAll(selector))
        expect(expected.length, selector).toBeGreaterThan(0)
        expect(
          subject.engines.nwsapi.select(selector, subject.document),
          selector,
        ).toEqual(expected)
      }
    } finally {
      subject.dom.window.close()
    }
  }
})

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

test('timing retains samples and invokes every runner in each round', async () => {
  const samples = [3, 1, 2]
  expect(median(samples)).toBe(2)
  expect(samples).toEqual([3, 1, 2])
  let calls = 0
  const result = await measure(
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
  expect(calls).toBeGreaterThanOrEqual(12)
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

// A cold query must never receive a document used by a warmup invocation.
test('Mitata prepares fresh state before every cold invocation', async () => {
  const seen = new Set<object>()
  const result = await sampleFresh(
    () => ({}),
    state => {
      expect(seen.has(state)).toBe(false)
      seen.add(state)
    },
  )
  expect(seen.size).toBeGreaterThanOrEqual(2)
  expect(Number.isFinite(result)).toBe(true)
  expect(result).toBeGreaterThanOrEqual(0)
})
