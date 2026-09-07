import { expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

test.each([
  ['empty', '<fieldset id="subject"></fieldset>', true],
  ['valid control', '<fieldset id="subject"><input></fieldset>', true],
  [
    'invalid control',
    '<fieldset id="subject"><input required></fieldset>',
    false,
  ],
  [
    'disabled control',
    '<fieldset id="subject"><input required disabled></fieldset>',
    true,
  ],
  [
    'disabled ancestor',
    '<fieldset disabled><fieldset id="subject"><input required></fieldset></fieldset>',
    true,
  ],
  [
    'nested invalid control',
    '<fieldset id="subject"><fieldset><input required></fieldset></fieldset>',
    false,
  ],
])('fieldset validity: %s', (_name, html, valid) => {
  const { window } = new JSDOM(html)
  try {
    const engine = factory(window)
    const subject = window.document.getElementById('subject')!
    for (let repeat = 0; repeat < 2; repeat += 1) {
      expect(engine.match(':valid', subject)).toBe(valid)
      expect(engine.match(':invalid', subject)).toBe(!valid)
      expect(engine.select('#subject:valid', window.document)).toEqual(
        valid ? [subject] : [],
      )
      expect(engine.select('#subject:invalid', window.document)).toEqual(
        valid ? [] : [subject],
      )
    }
  } finally {
    window.close()
  }
})

test('cached fieldset queries observe validation and tree changes', () => {
  const { window } = new JSDOM('<fieldset><input required></fieldset>')
  try {
    const engine = factory(window)
    const subject = window.document.querySelector('fieldset')!
    const control = window.document.querySelector('input')!
    const assertValid = (valid: boolean) => {
      expect(engine.match(':valid', subject)).toBe(valid)
      expect(engine.select('fieldset:valid', window.document)).toEqual(
        valid ? [subject] : [],
      )
    }
    assertValid(false)
    control.value = 'complete'
    assertValid(true)
    control.setCustomValidity('invalid')
    assertValid(false)
    control.disabled = true
    assertValid(true)
    control.disabled = false
    assertValid(false)
    control.remove()
    assertValid(true)
  } finally {
    window.close()
  }
})
