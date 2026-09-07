import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

test('disabled fieldsets honor only their own first legend', t => {
  const { window } = new JSDOM(`<fieldset disabled id="outer">
    <div></div><legend><input id="exempt"></legend>
    <legend><input id="second"></legend>
    <fieldset><legend><input id="nested"></legend></fieldset>
    <input id="plain"><textarea id="text"></textarea>
  </fieldset><input disabled id="own"><input id="enabled"><div id="neither"></div>`)
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  for (const id of [
    'exempt',
    'second',
    'nested',
    'plain',
    'text',
    'own',
    'enabled',
  ]) {
    const node = window.document.getElementById(id)
    const disabled = !['exempt', 'enabled'].includes(id)
    expect(engine.match(':disabled', node), id).toBe(disabled)
    expect(engine.match(':enabled', node), id).toBe(!disabled)
    expect(engine.match(':read-only', node), id).toBe(disabled)
    expect(engine.match(':read-write', node), id).toBe(!disabled)
  }
  const neither = window.document.getElementById('neither')
  expect(engine.match(':disabled', neither)).toBe(false)
  expect(engine.match(':enabled', neither)).toBe(false)
  const outer = window.document.querySelector('fieldset')
  outer.disabled = false
  expect(
    engine.select('input:disabled', window.document).map(e => e.id),
  ).toEqual(['own'])
  outer.disabled = true
  expect(
    engine.match(':enabled', window.document.getElementById('nested')),
  ).toBe(false)
})

test('options inherit disabled only from their immediate optgroup', t => {
  const { window } = new JSDOM(
    '<fieldset disabled><select disabled><optgroup id="group" disabled><option id="a"></option></optgroup><option id="b"></option><option disabled id="c"></option></select></fieldset>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  for (const id of ['group', 'a', 'b', 'c']) {
    const node = window.document.getElementById(id)
    expect(engine.match(':disabled', node), id).toBe(id !== 'b')
    expect(engine.match(':enabled', node), id).toBe(id === 'b')
  }
  window.document.querySelector('optgroup').disabled = false
  expect(engine.match(':disabled', window.document.getElementById('a'))).toBe(
    false,
  )
})
