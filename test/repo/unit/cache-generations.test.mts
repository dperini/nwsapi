import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('cache generations retain promoted entries and discard cold entries', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const cache = factory(window).matchLambdas
  for (let i = 0; i < 4096; i++) {
    cache.set(String(i), i)
  }
  expect(cache.get('0')).toBe(0)
  cache.set('4096', 4096)
  expect(cache.get('0')).toBe(0)
  expect(cache.get('1')).toBeUndefined()
  cache.set('0', 'updated')
  expect(cache.get('0')).toBe('updated')
  cache.clear()
  expect(cache.size()).toBe(0)
  expect(cache.get('0')).toBeUndefined()
})

test('promotions followed by insertions cannot exceed the cache limit', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const cache = factory(window).matchLambdas
  for (let i = 0; i < 4096; i++) {
    cache.set(String(i), i)
  }
  for (let i = 0; i < 2048; i++) {
    cache.get(String(i))
    expect(cache.size()).toBeLessThanOrEqual(4096)
  }
  cache.set('next', 'value')
  expect(cache.size()).toBeLessThanOrEqual(4096)
  expect(cache.get('next')).toBe('value')
})
