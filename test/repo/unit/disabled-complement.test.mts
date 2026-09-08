import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

test('fieldset absence follows insertions, detached trees, and document changes', t => {
  const { window } = new JSDOM('<!doctype html><input id="a"><input id="b">')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const { document } = window
  const a = document.getElementById('a')!
  const b = document.getElementById('b')!
  expect(nw.match(':enabled', a)).toBe(true)
  const fieldset = document.createElement('fieldset')
  fieldset.disabled = true
  document.body.append(fieldset)
  fieldset.append(a)
  expect(nw.match(':disabled', a)).toBe(true)
  fieldset.remove()
  expect(nw.match(':disabled', a)).toBe(true)
  expect(nw.match(':enabled', b)).toBe(true)
  document.body.append(a)
  const seen: string[] = []
  nw.select('input:enabled', document, element => {
    seen.push(element.id)
    document.body.append(fieldset)
    fieldset.append(a)
    expect(nw.match(':disabled', a)).toBe(true)
  })
  // Callbacks receive the query's snapshot; a new query sees the mutation.
  expect(seen).toEqual(['b', 'a'])
  expect(nw.select('input:enabled', document)).toEqual([b])
  const other = document.implementation.createHTMLDocument('other')
  other.body.innerHTML = '<fieldset disabled><input></fieldset>'
  expect(nw.select('input:enabled', other)).toEqual([])
  expect(nw.match(':enabled', b)).toBe(true)
})

test('a shadow tree keeps its own disabled-fieldset ancestor walk', t => {
  const { window } = new JSDOM('<!doctype html><div id="host"></div>')
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const { document } = window
  const host = document.getElementById('host')!
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = '<fieldset disabled><input id="inner"></fieldset>'
  const inner = shadow.getElementById('inner')!
  // The document's own tree holds no fieldset, but the shadow tree does.
  expect(document.getElementsByTagName('fieldset')).toHaveLength(0)
  expect(inner.matches(':disabled')).toBe(true)
  expect(nw.match(':disabled', inner)).toBe(true)
  expect(nw.match(':enabled', inner)).toBe(false)
})

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
  ] as const) {
    const node = window.document.getElementById(id)
    const disabled = !['exempt', 'enabled'].includes(id)
    expect(engine.match(':disabled', node!), id).toBe(disabled)
    expect(engine.match(':enabled', node!), id).toBe(!disabled)
    expect(engine.match(':read-only', node!), id).toBe(disabled)
    expect(engine.match(':read-write', node!), id).toBe(!disabled)
  }
  const neither = window.document.getElementById('neither')
  expect(engine.match(':disabled', neither!)).toBe(false)
  expect(engine.match(':enabled', neither!)).toBe(false)
  const outer = window.document.querySelector('fieldset')
  outer!.disabled = false
  expect(
    Array.from(engine.select('input:disabled', window.document)).map(e => e.id),
  ).toEqual(['own'])
  outer!.disabled = true
  expect(
    engine.match(':enabled', window.document.getElementById('nested')!),
  ).toBe(false)
})

test('options inherit an optgroup attribute without inheriting a select attribute', t => {
  const { window } = new JSDOM(
    '<fieldset><select disabled><optgroup id="group" disabled><option id="a"></option></optgroup><option id="b"></option><option disabled id="c"></option></select></fieldset>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  for (const id of ['group', 'a', 'b', 'c'] as const) {
    const node = window.document.getElementById(id)
    expect(engine.match(':disabled', node!), id).toBe(id !== 'b')
    expect(engine.match(':enabled', node!), id).toBe(id === 'b')
  }
  window.document.querySelector('optgroup')!.disabled = false
  expect(engine.match(':disabled', window.document.getElementById('a')!)).toBe(
    false,
  )
})
