import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../../../dist/nwsapi.js'

test('issue 261 retains generated-ID accessibility selectors within the default cache budget', t => {
  const { window } = new JSDOM('<!doctype html>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const selectors = Array.from({ length: 2300 }, (_, index) =>
    index % 2
      ? `[aria-labelledby~="generated-id-${index}"]`
      : `label[for="generated-id-${index}"]`,
  )
  const cache = Reflect.get(engine, 'selectResolvers')

  for (let pass = 0; pass < 4; ++pass) {
    for (const selector of selectors) {
      engine.select(selector, window.document)
    }
  }
  expect(selectors.every(selector => cache.has(selector))).toBe(true)
})
