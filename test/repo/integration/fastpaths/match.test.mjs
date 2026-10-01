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
