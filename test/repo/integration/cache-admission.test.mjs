import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const factory = require(
  process.env['NWSAPI_TEST_SOURCE'] || '../../../src/nwsapi.js',
)

function setup(t, settings = {}) {
  const { window } = new JSDOM('<p class="c0"></p>')
  t.after(() => window.close())
  const engine = factory(window)
  engine.configure(settings)
  return { engine, element: window.document.querySelector('p') }
}

for (const scenario of [
  { name: 'entry', count: 1001, settings: {}, selector: i => `.c${i}` },
  {
    name: 'byte',
    count: 2300,
    settings: { CACHE_LIMIT: 100000 },
    selector: i =>
      `:where(.css-x).ant-btn-${i}:not(:disabled):not(.ant-btn-disabled):hover`,
  },
]) {
  test(`stylesheet scans retain plans beyond the ${scenario.name} budget`, t => {
    const { engine, element } = setup(t, scenario.settings)
    const selectors = Array.from({ length: scenario.count }, (_, i) =>
      scenario.selector(i),
    )
    const cache = engine.matchResolvers
    for (const selector of selectors) {
      engine.match(selector, element)
    }
    let hits = 0
    const get = cache.get
    cache.get = key => {
      const value = get(key)
      hits += Number(value !== undefined)
      return value
    }
    for (let pass = 0; pass < 10; ++pass) {
      for (const selector of selectors) {
        assert.equal(engine.match(selector, element), selector === '.c0')
      }
      for (const retained of [cache, engine.matchLambdas]) {
        assert.ok(retained.size() <= engine.Config.CACHE_LIMIT)
        assert.ok(retained.bytes() <= engine.Config.CACHE_BYTES)
      }
    }
    const minimumRate = scenario.name === 'entry' ? 0.9 : 0.25
    assert.ok(hits > scenario.count * 10 * minimumRate, `retained ${hits} hits`)
  })
}

test('hot plans survive one-off churn and changed workloads gain admission', t => {
  const { engine } = setup(t, { CACHE_LIMIT: 64 })
  const cache = engine.matchResolvers
  for (let i = 0; i < 64; ++i) {
    cache.set(`old-${i}`, i)
  }
  for (let i = 0; i < 512; ++i) {
    assert.equal(cache.get('old-0'), 0)
    cache.set(`oneoff-${i}`, i)
    assert.ok(cache.size() <= 64)
  }
  for (let pass = 0; pass < 128; ++pass) {
    for (let i = 0; i < 16; ++i) {
      if (cache.get(`new-${i}`) === undefined) {
        cache.set(`new-${i}`, i)
      }
    }
  }
  for (let i = 0; i < 16; ++i) {
    assert.equal(cache.get(`new-${i}`), i)
  }
})

test('replacement, oversized entries, and reset preserve cache accounting', t => {
  const { engine } = setup(t, { CACHE_LIMIT: 4, CACHE_BYTES: 512 })
  const cache = engine.matchResolvers
  const trace = () => {
    const retained = []
    for (let i = 0; i < 40; ++i) {
      const key = `key-${i}`
      assert.equal(cache.set(key, i), i)
      retained.push(cache.has(key))
      assert.ok(cache.bytes() <= 512)
      assert.ok(cache.size() <= 4)
    }
    return retained
  }
  const first = trace()
  cache.clear()
  assert.equal(cache.bytes(), 0)
  assert.deepEqual(trace(), first)
  cache.clear()
  cache.set('resident', 1, 100)
  const before = cache.bytes()
  cache.set('resident', 2, 120)
  assert.equal(cache.get('resident'), 2)
  assert.equal(cache.size(), 1)
  assert.equal(cache.bytes(), before + 20)
  cache.set('oversized', 3, 513)
  assert.equal(cache.has('oversized'), false)
  assert.equal(cache.get('resident'), 2)
  cache.set('resident', 3, 513)
  assert.equal(cache.size(), 0)
  assert.equal(cache.bytes(), 0)
})

test('an admitted larger entry removes only the older entries needed to fit', t => {
  const { engine } = setup(t, { CACHE_LIMIT: 4, CACHE_BYTES: 512 })
  const cache = engine.matchResolvers
  for (const key of ['a', 'b', 'c', 'd']) {
    cache.set(key, key, 100)
  }
  for (let attempt = 0; attempt < 128 && !cache.has('large'); ++attempt) {
    assert.equal(cache.get('a'), 'a')
    cache.set('large', 'large', 300)
    assert.ok(cache.bytes() <= 512)
  }
  assert.equal(cache.get('large'), 'large')
  assert.equal(cache.get('a'), 'a')
  assert.equal(cache.size(), 2)
  assert.equal(cache.bytes(), 416)
})
