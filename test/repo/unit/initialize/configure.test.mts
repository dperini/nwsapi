import { expect, test, onTestFinished } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'

function setup() {
  const { window } = new JSDOM('<p class="hit"></p>')
  onTestFinished(() => window.close())
  return {
    window,
    engine: factory(window),
    element: window.document.querySelector('p')!,
  }
}

test('numeric cache settings resize existing caches and preserve boolean options', () => {
  const { engine, element } = setup()
  engine.match('.hit', element)
  const cache = engine.matchResolvers
  expect(engine.configure('CACHE_LIMIT')).toBe(4096)
  expect(engine.configure('CACHE_BYTES')).toBe(2 * 1024 * 1024)
  expect(engine.configure({ CACHE_LIMIT: 8, CACHE_BYTES: 4096 })).toBe(true)
  expect(engine.matchResolvers).toBe(cache)
  expect(cache.size()).toBe(0)
  for (let i = 0; i < 60; ++i) {
    engine.match('.item' + i, element)
  }
  expect(cache.size()).toBeLessThanOrEqual(8)
  expect(cache.bytes!()).toBeLessThanOrEqual(4096)
  expect(engine.match('.hit', element)).toBe(true)
  expect(engine.configure('VERBOSITY')).toBe(true)
  engine.configure({ LOGERRORS: 0 })
  expect(engine.configure('LOGERRORS')).toBe(false)
  engine.configure({ CACHE_LIMIT: 8 })
  expect(cache.size()).toBeGreaterThan(0)
})

test.each([-1, 1.5, Infinity, NaN, '8192', true, null, undefined, 2 ** 53])(
  'invalid cache budgets are rejected before changing options: %s',
  value => {
    const { engine, element } = setup()
    engine.match('.hit', element)
    const size = engine.matchResolvers.size()
    expect(() =>
      engine.configure({
        LOGERRORS: false,
        CACHE_LIMIT: 8,
        CACHE_BYTES: value,
      }),
    ).toThrow(TypeError)
    expect(engine.configure('LOGERRORS')).toBe(true)
    expect(engine.configure('CACHE_LIMIT')).toBe(4096)
    expect(engine.matchResolvers.size()).toBe(size)
    expect(() => engine.configure({ CACHE_LIMIT: value })).toThrow(TypeError)
  },
)

test.each(['CACHE_LIMIT', 'CACHE_BYTES'])(
  'zero %s disables plan retention and can be restored',
  key => {
    const { engine, element } = setup()
    engine.configure({ [key]: 0 })
    for (let i = 0; i < 10; ++i) {
      expect(engine.match('.hit', element)).toBe(true)
    }
    expect(engine.matchResolvers.size()).toBe(0)
    expect(engine.matchLambdas.size()).toBe(0)
    engine.configure({ CACHE_LIMIT: 4096, CACHE_BYTES: 2 * 1024 * 1024 })
    expect(engine.match('.hit', element)).toBe(true)
    expect(engine.matchResolvers.size()).toBe(1)
  },
)

test('configuration remains isolated between engines', () => {
  const first = setup().engine
  const second = setup().engine
  first.configure({ CACHE_LIMIT: 7, CACHE_BYTES: 2048 })
  expect(second.configure('CACHE_LIMIT')).toBe(4096)
  expect(second.configure('CACHE_BYTES')).toBe(2 * 1024 * 1024)
})

test('configuration reads accessor values once before validation', () => {
  const { engine } = setup()
  let reads = 0
  engine.configure({
    get CACHE_LIMIT() {
      return ++reads === 1 ? 8 : Infinity
    },
  })
  expect(reads).toBe(1)
  expect(engine.configure('CACHE_LIMIT')).toBe(8)
})
