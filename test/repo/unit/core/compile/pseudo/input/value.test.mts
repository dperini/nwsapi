import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { JSDOM, type DOMWindow } from 'jsdom'
import factory from '../../../../../../../dist/nwsapi.js'
import { registerLegacy } from '../../../../../common/legacy.mts'

const windows: DOMWindow[] = []

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.close()
  }
})

function build(html: string) {
  const { window } = new JSDOM(html)
  windows.push(window)
  return { window, document: window.document, NW: factory(window) }
}

function ids(elements: ArrayLike<Element>) {
  return Array.from(elements, element => element.id)
}

test('radio names are compared as exact strings without selector interpolation', () => {
  const { document, NW } = build(
    '<input id="space-target" type="radio" name="group with spaces">' +
      '<input id="space-checked" type="radio" name="group with spaces" checked>' +
      '<input id="quote-target" type="radio" name="group &quot;quote&quot; / slash">' +
      '<input id="quote-checked" type="radio" name="group &quot;quote&quot; / slash" checked>' +
      '<input id="other-target" type="radio" name="group with spaces /">',
  )
  const space = document.querySelector('#space-target')!

  assert.equal(NW.match('input:indeterminate', space), false)
  assert.equal(NW.first('#quote-target:indeterminate', document), null)
  assert.deepEqual(ids(NW.select('input:indeterminate', document)), [
    'other-target',
  ])
})

test('form-owned radios include controls outside form descendants', () => {
  const { document, NW } = build(
    '<form id="owner"><input id="inside" type="radio" name="choice"></form>' +
      '<input id="outside" type="radio" name="choice" form="owner" checked>',
  )

  assert.deepEqual(ids(NW.select('input:indeterminate', document)), [])
})

test('radio groups stay within their form and tree, including detached roots', () => {
  const { document, NW } = build(
    '<form id="first"><input id="first-target" type="radio" name="x"></form>' +
      '<form id="second"><input id="second-checked" type="radio" name="x" checked></form>' +
      '<input id="document-target" type="radio" name="shadow-choice">',
  )
  const host = document.createElement('div')
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML =
    '<input id="shadow-checked" type="radio" name="shadow-choice" checked>'
  const detached = document.createElement('input')
  detached.type = 'radio'
  detached.id = 'detached'
  const fragment = document.createDocumentFragment()
  fragment.append(
    Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'fragment-choice',
      id: 'fragment-target',
    }),
    Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'fragment-choice',
      checked: true,
      id: 'fragment-checked',
    }),
  )

  assert.deepEqual(ids(NW.select('input:indeterminate', document)), [
    'first-target',
    'document-target',
  ])
  assert.equal(NW.match(':indeterminate', detached), true)
  assert.equal(NW.select('input:indeterminate', fragment).length, 0)
  assert.equal(
    shadow.querySelector<HTMLInputElement>('#shadow-checked')?.checked,
    true,
  )
})

test('root inputs and legacy tag readers participate in radio groups', () => {
  const { document, NW } = build('<div id="host"></div>')
  const rootRadio = document.createElement('input')
  rootRadio.type = 'radio'
  rootRadio.name = 'nested'
  rootRadio.checked = true
  const nestedRadio = document.createElement('input')
  nestedRadio.type = 'radio'
  nestedRadio.name = 'nested'
  rootRadio.append(nestedRadio)
  const legacyTarget = document.createElement('input')
  legacyTarget.type = 'radio'
  legacyTarget.name = 'legacy'
  const legacyChecked = document.createElement('input')
  legacyChecked.type = 'radio'
  legacyChecked.name = 'legacy'
  legacyChecked.checked = true
  document.querySelector('#host')!.append(legacyTarget, legacyChecked)

  assert.equal(NW.match(':indeterminate', nestedRadio), false)
  const legacy = registerLegacy(NW)
  legacy.configure({ LEGACY: true })
  assert.equal(legacy.match(':indeterminate', legacyTarget), false)
})

test('unnamed radios, checkedness, and name changes update indeterminate state', () => {
  const { document, NW } = build(
    '<input id="target" type="radio" name="choice">' +
      '<input id="peer" type="radio" name="choice">' +
      '<input id="unnamed" type="radio">' +
      '<input id="checked-unnamed" type="radio" checked>' +
      '<input id="check" type="checkbox" name="choice" checked>',
  )
  const target = document.querySelector<HTMLInputElement>('#target')!
  const peer = document.querySelector<HTMLInputElement>('#peer')!
  const unnamed = document.querySelector<HTMLInputElement>('#unnamed')!
  const checkedUnnamed =
    document.querySelector<HTMLInputElement>('#checked-unnamed')!
  const checkbox = document.querySelector<HTMLInputElement>('#check')!

  assert.deepEqual(ids(NW.select('input:indeterminate', document)), [
    'target',
    'peer',
    'unnamed',
  ])
  assert.equal(NW.first(':indeterminate', document), target)
  assert.equal(NW.match(':indeterminate', unnamed), true)
  assert.equal(NW.match(':indeterminate', checkedUnnamed), false)

  peer.checked = true
  assert.equal(NW.match(':indeterminate', target), false)
  peer.checked = false
  peer.name = 'other'
  assert.equal(NW.match(':indeterminate', target), true)
  target.name = ''
  peer.name = ''
  peer.checked = true
  assert.equal(NW.match(':indeterminate', target), true)
  checkbox.indeterminate = true
  assert.equal(NW.match(':indeterminate', checkbox), true)
})
