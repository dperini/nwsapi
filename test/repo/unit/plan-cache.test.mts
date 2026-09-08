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
  expect(Object.keys(plan).toSorted()).toEqual(['factory', 'nodeset'])
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

test('cached selector lists preserve order, duplicates, and context changes', t => {
  const { window } = new JSDOM(
    '<main><p class="item"></p><i></i><p></p></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const main = window.document.querySelector('main')!
  const selectors = ['p.item', 'i, p.item', 'p, p, i', 'p.item, .missing, i']
  for (const selector of selectors) {
    const expected = [...main.querySelectorAll(selector)]
    expect(engine.select(selector, main)).toEqual(expected)
    expect(engine.select(selector, main)).toEqual(expected)
    expect(engine.first(selector, main)).toBe(expected[0] ?? null)
    expect(engine.first(selector, main)).toBe(expected[0] ?? null)
  }
  main.firstElementChild!.remove()
  for (const selector of selectors) {
    expect(engine.select(selector, main)).toEqual([
      ...main.querySelectorAll(selector),
    ])
  }
})
