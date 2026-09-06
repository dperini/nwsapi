import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../src/nwsapi.js'

for (const [markup, valid] of [
  ['', true],
  ['<input value="ok">', true],
  ['<input required>', false],
  ['<input value="ok"><input required>', false],
  ['<input disabled required>', true],
  ['<fieldset disabled><input required></fieldset>', true],
  ['<fieldset><input required></fieldset>', false],
] as const) {
  test(`fieldset validity: ${markup || 'empty'}`, t => {
    const { window } = new JSDOM(`<fieldset id="subject">${markup}</fieldset>`)
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    const node = window.document.getElementById('subject')
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(engine.match(':valid', node)).toBe(valid)
      expect(engine.match(':invalid', node)).toBe(!valid)
      expect(engine.select('#subject:valid', window.document)).toEqual(
        valid ? [node] : [],
      )
    }
    node.innerHTML = '<input required>'
    expect(engine.match(':valid', node)).toBe(false)
    node.querySelector('input').value = 'filled'
    expect(engine.match(':valid', node)).toBe(true)
    node.textContent = ''
    expect(engine.match(':valid', node)).toBe(true)
  })
}
