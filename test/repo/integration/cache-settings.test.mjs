import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const factory = require('../../../src/nwsapi.js')

function setup(t) {
  const { window } = new JSDOM('<p class="hit"></p>')
  t.after(() => window.close())
  return { engine: factory(window), element: window.document.querySelector('p') }
}

test('numeric settings resize existing caches and preserve default values', t => {
  const { engine, element } = setup(t)
  assert.equal(engine.configure('CACHE_LIMIT'), 1000)
  assert.equal(engine.configure('CACHE_BYTES'), 2 * 1024 * 1024)
  engine.match('.hit', element)
  const cache = engine.matchResolvers
  engine.configure({ CACHE_LIMIT: 8, CACHE_BYTES: 4096 })
  assert.equal(cache, engine.matchResolvers)
  assert.equal(cache.size(), 0)
  for (let i = 0; i < 40; ++i) {
    engine.match('.item' + i, element)
    assert.ok(cache.size() <= 8)
    assert.ok(cache.bytes() <= 4096)
  }
  assert.equal(engine.match('.hit', element), true)
  engine.configure({ CACHE_LIMIT: 8 })
  assert.ok(cache.size() > 0)
  engine.configure({ CACHE_LIMIT: 2 })
  assert.equal(cache.size(), 0)
  engine.configure({ LOGERRORS: 0 })
  assert.equal(engine.configure('LOGERRORS'), false)
})

for (const key of ['CACHE_LIMIT', 'CACHE_BYTES']) {
  test('zero ' + key + ' disables retention and can be restored', t => {
    const { engine, element } = setup(t)
    engine.configure({ [key]: 0 })
    for (let i = 0; i < 10; ++i) {
      assert.equal(engine.match('.hit', element), true)
    }
    assert.equal(engine.matchResolvers.size(), 0)
    assert.equal(engine.matchLambdas.size(), 0)
    engine.configure({ CACHE_LIMIT: 1000, CACHE_BYTES: 2 * 1024 * 1024 })
    assert.equal(engine.match('.hit', element), true)
    assert.ok(engine.matchResolvers.size() > 0)
  })
}

test('invalid budgets fail atomically and instances stay isolated', t => {
  const { engine, element } = setup(t)
  const other = setup(t).engine
  engine.match('.hit', element)
  const size = engine.matchResolvers.size()
  for (const value of [-1, 1.5, Infinity, NaN, '8192', true, null, undefined, 2 ** 53]) {
    assert.throws(() => engine.configure({ LOGERRORS: false, CACHE_LIMIT: 8, CACHE_BYTES: value }), TypeError)
    assert.throws(() => engine.configure({ CACHE_LIMIT: value }), TypeError)
    assert.equal(engine.configure('CACHE_LIMIT'), 1000)
    assert.equal(engine.configure('LOGERRORS'), true)
    assert.equal(engine.matchResolvers.size(), size)
  }
  engine.configure({ CACHE_LIMIT: 8 })
  assert.equal(other.configure('CACHE_LIMIT'), 1000)
})

test('expanded budgets retain a stylesheet that exceeds default entry bounds', t => {
  const { engine, element } = setup(t)
  engine.configure({ CACHE_LIMIT: 8192, CACHE_BYTES: 8 * 1024 * 1024 })
  const selectors = Array.from({ length: 2300 }, (_, i) =>
    `:where(.css-x).ant-btn-${i}:not(:disabled):not(.ant-btn-disabled):hover`)
  for (const selector of selectors) {
    engine.match(selector, element)
  }
  for (const selector of selectors) {
    assert.equal(engine.matchResolvers.has(selector), true)
    assert.equal(engine.match(selector, element), false)
  }
  assert.ok(engine.matchResolvers.bytes() <= 8 * 1024 * 1024)
})


test('configuration reads accessor values once before validation', t => {
  const { engine } = setup(t)
  let reads = 0
  engine.configure({ get CACHE_LIMIT() { return ++reads === 1 ? 8 : Infinity } })
  assert.equal(reads, 1)
  assert.equal(engine.configure('CACHE_LIMIT'), 8)
})
