import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js')

for (const quote of ["'", '"']) {
  for (const combinator of ['+', '~', '>']) {
    test(`quoted attributes after pseudos (${quote}, ${combinator})`, t => {
      const markup =
        combinator === '>'
          ? '<div class="A"><p class="b" id="target"></p></div>'
          : '<div><p class="A">text</p><p class="b" id="target"></p></div>'
      const { window } = new JSDOM(markup)
      t.onTestFinished(() => window.close())
      const engine = factory(window)
      const selector = `[class*=${quote}a${quote} i]:not(:empty) ${combinator} [class*=${quote}b${quote}]`
      const target = window.document.getElementById('target')
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(engine.select(selector, window.document)).toEqual([target])
        expect(engine.first(selector, window.document)).toBe(target)
        expect(engine.match(selector, target)).toBe(true)
      }
      target.className = 'c'
      expect(engine.select(selector, window.document)).toEqual([])
    })
  }
}

test('invalid selectors retain their original text in errors', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const selector = "[class*='a' i]:not(:empty)+[class*='b'] ?"
  expect(() => engine.select(selector, window.document)).toThrow(selector)
})
