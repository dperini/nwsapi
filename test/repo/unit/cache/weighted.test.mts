import { expect, test } from 'vitest'
import { createWeightedCache } from '../../../../src/core/cache/weighted.mts'
import type { EngineState } from '../../../../src/core/state/types.mts'
import { JSDOM } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'

test('weighted caches respect both limits while promoting and replacing entries', () => {
  const engine = { primordials: { MapCtor: Map } } as EngineState
  const cache = createWeightedCache(engine, 6, {
    bytes: 1024,
    weight: (value: string) => value.length * 2,
  })
  for (let i = 0; i < 30; ++i) {
    cache.set('key' + i, 'x'.repeat(60))
    cache.get('key' + (i - 1))
    expect(cache.bytes!()).toBeLessThanOrEqual(1024)
    expect(cache.size()).toBeLessThanOrEqual(6)
  }
  cache.clear()
  cache.set('key29', 'small')
  expect(cache.get('key29')).toBe('small')
  cache.set('oversized', 'x'.repeat(1024))
  expect(cache.get('oversized')).toBeUndefined()
  expect(cache.get('key29')).toBe('small')
  cache.clear()
  expect(cache.size()).toBe(0)
  expect(cache.bytes!()).toBe(0)
})

test('large selector churn bounds compiled caches without changing retained resolvers', t => {
  const { window } = new JSDOM('<div class="hit"></div>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const saved = engine.compile('.hit', false)!
  const element = window.document.querySelector('div')!
  for (let i = 0; i < 800; ++i) {
    engine.compile('[data-key="' + i + 'x'.repeat(800) + '"]', false)
  }
  const cache = Reflect.get(engine, 'matchLambdas')
  expect(cache.bytes!()).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect(cache.size()).toBeLessThan(800)
  expect(saved(element, null, window.document, false)).toBe(true)
  engine.configure({}, true)
  expect(cache.bytes!()).toBe(0)
})

for (const MapCtor of [Map, undefined]) {
  test(`cyclic scans retain useful entries with Map=${!!MapCtor}`, () => {
    const engine = {
      primordials: { MapCtor },
      Config: { CACHE_LIMIT: 64, CACHE_BYTES: 8192 },
    } as EngineState
    const cache = createWeightedCache(engine, undefined, { weight: () => 8 })
    for (let i = 0; i < 65; ++i) {
      cache.set(String(i), i)
    }
    let hits = 0
    for (let pass = 0; pass < 10; ++pass) {
      for (let i = 0; i < 65; ++i) {
        const key = String(i)
        const value = cache.get(key)
        if (value === undefined) {
          cache.set(key, i)
        } else {
          expect(value).toBe(i)
          ++hits
        }
        expect(cache.size()).toBeLessThanOrEqual(64)
        expect(cache.bytes!()).toBeLessThanOrEqual(8192)
      }
    }
    expect(hits).toBeGreaterThan(500)
    for (let pass = 0; pass < 100; ++pass) {
      for (let i = 100; i < 116; ++i) {
        if (cache.get(String(i)) === undefined) {
          cache.set(String(i), i)
        }
      }
    }
    for (let i = 100; i < 116; ++i) {
      expect(cache.get(String(i))).toBe(i)
    }
    cache.clear()
    for (const key of ['__proto__', 'constructor', 'toString', '\x01key']) {
      cache.set(key, 42)
      expect(cache.get(key)).toBe(42)
    }
  })
}

test('replacing entries accounts bytes exactly and rejects oversized replacements', () => {
  const engine = { primordials: { MapCtor: Map } } as EngineState
  const cache = createWeightedCache(engine, 4, {
    bytes: 512,
    weight: (value: string) => value.length,
  })
  cache.set('a', 'x')
  expect(cache.bytes!()).toBe(99)
  cache.set('a', 'xxx')
  expect(cache.size()).toBe(1)
  expect(cache.bytes!()).toBe(101)
  cache.set('a', 'x'.repeat(600))
  expect(cache.size()).toBe(0)
  expect(cache.bytes!()).toBe(0)
})
