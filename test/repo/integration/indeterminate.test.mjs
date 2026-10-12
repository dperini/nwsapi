import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const factory = require('../../../src/nwsapi.js')

function setup(t) {
  const { window } = new JSDOM('<!doctype html>')
  t.after(() => window.close())
  return { document: window.document, engine: factory(window) }
}

test('radio indeterminate checks handle selector-special names', t => {
  const { document, engine } = setup(t)
  const form = document.createElement('form')
  form.innerHTML = '<input type="radio"><input type="radio">'
  const [checked, unchecked] = form.querySelectorAll('input')
  checked.checked = true

  for (const name of ['two words', 'quote"name', "single'name", 'a\\b', 'a,b']) {
    checked.name = name
    unchecked.name = name
    assert.equal(engine.match(':indeterminate', unchecked), false, name)
    assert.equal(engine.match(':indeterminate', checked), false, name)
    checked.checked = false
    assert.equal(engine.match(':indeterminate', unchecked), true, name)
    checked.checked = true
  }
})

test('radio indeterminate groups stay scoped to their form and tree', t => {
  const { document, engine } = setup(t)
  const unnamed = document.createElement('input')
  unnamed.type = 'radio'
  assert.equal(engine.match(':indeterminate', unnamed), true)

  const firstForm = document.createElement('form')
  const secondForm = document.createElement('form')
  firstForm.innerHTML = '<input type="radio" name="group">'
  secondForm.innerHTML = '<input type="radio" name="group">'
  const first = firstForm.querySelector('input')
  const second = secondForm.querySelector('input')
  first.checked = true
  assert.equal(engine.match(':indeterminate', second), true)

  const externalForm = document.createElement('form')
  externalForm.id = 'external-form'
  document.body.append(externalForm)
  const externalChecked = document.createElement('input')
  const externalUnchecked = document.createElement('input')
  for (const radio of [externalChecked, externalUnchecked]) {
    radio.type = 'radio'
    radio.name = 'external-group'
    radio.setAttribute('form', externalForm.id)
    document.body.append(radio)
  }
  externalChecked.checked = true
  assert.equal(externalUnchecked.form, externalForm)
  assert.equal(engine.match(':indeterminate', externalUnchecked), false)

  const fragment = document.createDocumentFragment()
  const detachedChecked = document.createElement('input')
  const detachedUnchecked = document.createElement('input')
  detachedChecked.type = detachedUnchecked.type = 'radio'
  detachedChecked.name = detachedUnchecked.name = 'group'
  fragment.append(detachedChecked, detachedUnchecked)
  detachedChecked.checked = true
  assert.equal(engine.match(':indeterminate', detachedUnchecked), false)

  detachedChecked.checked = false
  assert.equal(engine.match(':indeterminate', detachedUnchecked), true)

  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const shadowRadio = document.createElement('input')
  shadowRadio.type = 'radio'
  shadowRadio.name = 'group'
  shadow.append(shadowRadio)
  const documentRadio = document.createElement('input')
  documentRadio.type = 'radio'
  documentRadio.name = 'group'
  documentRadio.checked = true
  document.body.append(host, documentRadio)
  assert.equal(engine.match(':indeterminate', shadowRadio), true)
})
