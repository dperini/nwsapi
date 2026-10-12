import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const source = readFileSync(
  process.env['NWSAPI_TEST_SOURCE'] ||
    new URL('../../../../src/nwsapi.js', import.meta.url),
  'utf8',
)

function fixture(t) {
  const { window } = new JSDOM('<!doctype html><div id="target"></div>', {
    runScripts: 'outside-only',
  })
  t.after(() => window.close())
  window.eval(source)
  return { window, document: window.document, engine: window.NW.Dom }
}

test('callback-free selector lists stop at the first matching branch', t => {
  const { document, engine } = fixture(t)
  const element = document.getElementById('target')
  engine.Snapshot.branchCount = 0
  engine.registerSelector('test:count', /^:count\((\d+)\)(.*)/, (match, next) => ({
    source: 's.branchCount++;' + next,
    status: true,
  }))

  assert.equal(engine.match(':count(1), :count(2)', element), true)
  assert.equal(engine.Snapshot.branchCount, 1)

  engine.Snapshot.branchCount = 0
  assert.equal(engine.match(':count(1), :count(2)', element, () => {}), true)
  assert.equal(engine.Snapshot.branchCount, 2)
})

test(':target checks the hash and element ID before document position', t => {
  const { document, engine } = fixture(t)
  const element = document.getElementById('target')
  const native = document.compareDocumentPosition
  let calls = 0
  document.compareDocumentPosition = function (...args) {
    calls++
    return native.apply(this, args)
  }

  assert.equal(engine.match(':target', element), false)
  assert.equal(calls, 0)

  document.location.hash = '#other'
  assert.equal(engine.match(':target', element), false)
  assert.equal(calls, 0)

  document.location.hash = '#target'
  assert.equal(engine.match(':target', element), true)
  assert.equal(calls, 1)
})

test(':target tolerates documents without a browsing-context location', t => {
  const { window, document, engine } = fixture(t)
  const htmlElement = document.getElementById('target')
  document.location.hash = '#target'
  const xml = new window.DOMParser().parseFromString(
    '<root id="target"><item id="target"/></root>',
    'application/xml',
  )
  const detached = document.implementation.createHTMLDocument('')
  const cases = [
    { document, element: htmlElement, expected: true },
    { document: xml, element: xml.documentElement, expected: false },
    { document: detached, element: detached.documentElement, expected: false },
  ]

  for (let pass = 0; pass < 2; pass++) {
    for (const { document: context, element, expected } of cases) {
      assert.equal(engine.match(':target', element), expected)
      assert.equal(engine.select(':target', context).includes(element), expected)
      assert.equal(engine.first(':target', context), expected ? element : null)
    }
  }
})

test(':indeterminate checks named radio groups without parsing radio names', t => {
  const { document, engine } = fixture(t)
  const form = document.createElement('form')
  const radios = ['two words', 'quote"name', 'back\\slash'].map(name => {
    const checked = document.createElement('input')
    const unchecked = document.createElement('input')
    checked.type = unchecked.type = 'radio'
    checked.name = unchecked.name = name
    form.append(checked, unchecked)
    return { checked, unchecked }
  })
  document.body.append(form)

  for (const { checked, unchecked } of radios) {
    assert.equal(engine.match(':indeterminate', unchecked), true)
    checked.checked = true
    assert.equal(engine.match(':indeterminate', unchecked), false)
    checked.checked = false
  }

  const detachedChecked = document.createElement('input')
  const detachedUnchecked = document.createElement('input')
  detachedChecked.type = detachedUnchecked.type = 'radio'
  detachedChecked.name = detachedUnchecked.name = 'detached'
  detachedChecked.checked = true
  detachedChecked.append(detachedUnchecked)
  assert.equal(engine.match(':indeterminate', detachedUnchecked), false)
})

test(':empty ignores comments and rejects text and CDATA children', t => {
  const { document, engine, window } = fixture(t)
  const element = document.getElementById('target')
  element.appendChild(document.createComment('ignored'))
  assert.equal(engine.match(':empty', element), true)
  element.appendChild(document.createTextNode('text'))
  assert.equal(engine.match(':empty', element), false)

  const xml = new window.DOMParser().parseFromString('<root><item/></root>', 'application/xml')
  const item = xml.querySelector('item')
  assert.equal(engine.match(':empty', item), true)
  item.appendChild(xml.createCDATASection('text'))
  assert.equal(engine.match(':empty', item), false)
})
