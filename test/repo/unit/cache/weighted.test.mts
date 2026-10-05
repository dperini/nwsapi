import { expect, test } from 'vitest'
import { createWeightedCache } from '../../../../src/core/cache/weighted.mts'
import type { EngineState } from '../../../../src/core/state/types.mts'
import { JSDOM } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'

test('weighted generations respect both limits while promoting and replacing entries', () => {
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
  expect(cache.get('key29')).toBe('x'.repeat(60))
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
