import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../src/nwsapi.js'

for (const pseudo of [':autofill', ':-webkit-autofill']) {
  test(`${pseudo} does not match ordinary elements or skip its suffix`, t => {
    const { window } = new JSDOM('<input id="a"><input id="b"><div></div>')
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    expect(engine.select(pseudo, window.document)).toEqual([])
    expect(engine.select(`input${pseudo}`, window.document)).toEqual([])
    expect(() => engine.select(`${pseudo}:unknown`, window.document)).toThrow()
    const input = window.document.getElementById('a')
    let filled = true
    Object.defineProperty(input, 'matches', { value: () => filled })
    for (let repeat = 0; repeat < 2; repeat++) {
      filled = true
      expect(engine.select(`input${pseudo}#a`, window.document)).toEqual([
        input,
      ])
      expect(engine.first(`input${pseudo}#a`, window.document)).toBe(input)
      expect(engine.match(`${pseudo}#b`, input)).toBe(false)
      filled = false
      expect(engine.select(`input${pseudo}#a`, window.document)).toEqual([])
    }
  })
}

test('autofill retains alias fallback without recursive host calls', t => {
  const { window } = new JSDOM('<input>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const input = window.document.querySelector('input')
  Object.defineProperty(input, 'matches', {
    configurable: true,
    value(selector) {
      if (selector === ':autofill') {
        throw new Error('unsupported')
      }
      return selector === ':-webkit-autofill'
    },
  })
  expect(engine.match(':autofill', input)).toBe(true)
  let calls = 0
  Object.defineProperty(input, 'matches', {
    value(selector) {
      if (++calls > 4) {
        throw new Error('unbounded recursion')
      }
      return engine.match(selector, input)
    },
  })
  expect(engine.match(':autofill', input)).toBe(false)
  expect(calls).toBeGreaterThan(0)
  expect(calls).toBeLessThanOrEqual(2)
})
