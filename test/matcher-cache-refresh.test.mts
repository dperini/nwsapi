import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../src/nwsapi.js'

test('matcher replacement clears a cached delegation result', t => {
  const { window } = new JSDOM('<div popover></div><div popover></div>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const [first, second] = window.document.querySelectorAll('div')
  let calls = 0
  Object.defineProperty(first, 'matches', {
    configurable: true,
    value(selector) {
      calls++
      return engine.match(selector, first)
    },
  })
  expect(engine.match(':popover-open', first)).toBe(false)
  expect(engine.match(':popover-open', first)).toBe(false)
  expect(calls).toBe(1)
  Object.defineProperty(first, 'matches', { value: () => true })
  expect(engine.match(':popover-open', first)).toBe(true)
  expect(engine.match(':popover-open', second)).toBe(false)
  expect(engine.match(':popover-open', first)).toBe(true)
  window.Element.prototype.matches = function (): this is Element {
    return true
  }
  expect(engine.match(':popover-open', second)).toBe(true)
})

test('LEGACY changes refresh cached aliases in every document', t => {
  const windows = [
    new JSDOM('<div popover></div>'),
    new JSDOM('<div popover></div>'),
  ]
  t.onTestFinished(() => windows.forEach(dom => dom.window.close()))
  const engine = factory(windows[0].window)
  const nodes = windows.map(({ window }) => {
    Object.defineProperty(window.Element.prototype, 'matches', {
      value: undefined,
    })
    Object.defineProperty(window.Element.prototype, 'webkitMatchesSelector', {
      value: () => true,
    })
    return window.document.body.firstElementChild
  })
  for (const legacy of [false, true, false, true]) {
    engine.configure({ LEGACY: legacy })
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const node of nodes) {
        expect(engine.match(':popover-open', node)).toBe(legacy)
      }
    }
  }
})
