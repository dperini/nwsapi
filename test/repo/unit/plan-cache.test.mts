import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('cached plans retain no query results, context, or callback', t => {
  const { window } = new JSDOM('<main><p class="a.b"></p><p></p></main>', {
    url: 'https://example.test/',
  })
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  const main = doc.querySelector('main')!
  const selector = 'p.a\\.b'
  const seen: Element[] = []
  expect(
    engine.select(selector, main, element => {
      seen.push(element)
    }),
  ).toEqual([main.firstElementChild])
  const cache = Reflect.get(engine, 'selectResolvers')
  const plan = cache.get(selector)
  expect(Object.keys(plan).sort()).toEqual(['factory', 'nodeset'])
  expect(seen).toEqual([main.firstElementChild])
  const other = doc.createDocumentFragment()
  other.append(main.cloneNode(true))
  expect(engine.select(selector, other)).toEqual([other.firstChild!.firstChild])
  expect(cache.get(selector)).toBe(plan)
  main.firstElementChild!.remove()
  expect(engine.select(selector, main)).toEqual([])
  expect(engine.first(selector, main)).toBeNull()
  expect(cache.get(selector)).toBe(plan)
  expect(engine.select(selector, other)).toEqual([other.firstChild!.firstChild])
  expect(cache.get(selector)).toBe(plan)
})
