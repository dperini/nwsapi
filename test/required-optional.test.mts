import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../src/nwsapi.js'

test('required and optional apply only to the complete control names', t => {
  const { window } = new JSDOM(
    '<input-widget></input-widget><x-select></x-select><x-textarea></x-textarea><button></button><select></select><textarea></textarea>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  for (const node of window.document.body.children) {
    const control = ['button', 'select', 'textarea'].includes(node.localName)
    for (const required of [false, true, false]) {
      Object.defineProperty(node, 'required', {
        configurable: true,
        value: required,
      })
      const expected = control && node.localName !== 'button' && required
      expect(engine.match(':required', node)).toBe(expected)
      expect(engine.match(':optional', node)).toBe(control && !expected)
    }
  }
})

for (const type of [
  'text',
  'email',
  'checkbox',
  'radio',
  'file',
  'number',
  'date',
  'hidden',
  'range',
  'color',
  'button',
  'submit',
  'reset',
  'image',
]) {
  test(`input type=${type} respects whether required applies`, t => {
    const { window } = new JSDOM(`<input type="${type}">`)
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    const input = window.document.querySelector('input')
    const applicable = ![
      'hidden',
      'range',
      'color',
      'button',
      'submit',
      'reset',
      'image',
    ].includes(type)
    for (const required of [false, true, false]) {
      input.required = required
      expect(engine.match(':required', input)).toBe(applicable && required)
      expect(engine.match(':optional', input)).toBe(!(applicable && required))
      expect(engine.select(':required', window.document)).toEqual(
        applicable && required ? [input] : [],
      )
    }
  })
}
