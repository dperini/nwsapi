import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../../dist/nwsapi.js'

test('pure alternatives share candidates and preserve ordering after mutation', t => {
  const { window } = new JSDOM(
    '<main><i class="card" data-a></i><i class="card" data-b></i><i class="card" data-a data-b></i></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  const selector = '.card[data-a], .card[data-b]'
  const expected = Array.from(doc.querySelectorAll(selector))
  const lookup = vi.spyOn(doc, 'getElementsByClassName')
  expect(engine.select(selector, doc)).toEqual(expected)
  expect(lookup).toHaveBeenCalledTimes(1)
  lookup.mockClear()
  expect(engine.select(selector, doc)).toEqual(expected)
  expect(lookup).toHaveBeenCalledTimes(1)
  expected[0]!.removeAttribute('data-a')
  expect(engine.select(selector, doc)).toEqual(expected.slice(1))
  expect(engine.select('i[data-b], i[data-a]', doc)).toEqual(expected.slice(1))
})

test('logical traversals restore their candidate and bypass repeated dependency dispatch', t => {
  const { window } = new JSDOM(
    '<main><section><span class="hit"></span><span></span></section></main><aside><span class="hit"></span></aside>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const snapshot = engine.Snapshot as unknown as {
    matchForgivingKey: (key: string, element: Element) => boolean
  }
  const dispatch = vi.spyOn(snapshot, 'matchForgivingKey')
  for (const selector of [
    'span:is(main > section > span, aside > span).hit',
    'span:not(aside > span).hit',
  ]) {
    const expected = Array.from(window.document.querySelectorAll(selector))
    expect(engine.select(selector)).toEqual(expected)
    expect(engine.first(selector)).toBe(expected[0])
    for (const element of window.document.querySelectorAll('span')) {
      expect(engine.match(selector, element)).toBe(element.matches(selector))
    }
  }
  expect(dispatch).not.toHaveBeenCalled()
})
