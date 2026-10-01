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
  const { window } = new JSDOM('<!doctype html><main></main>', {
    runScripts: 'outside-only',
  })
  t.after(() => window.close())
  window.eval(source)
  return { document: window.document, engine: window.NW.Dom }
}

test('compiled class matching scans standards-mode tokens, including SVG classes', t => {
  const { document, engine } = fixture(t)
  const html = document.createElement('div')
  html.className = 'foo bar'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'foo bar')

  assert.equal(engine.match('.foo', html), true)
  assert.equal(engine.match('.\\66 oo', html), true)
  assert.equal(engine.match('.bar', svg), true)
  assert.equal(engine.match('.missing', svg), false)
})

test('fragment class lookup matches every requested token and reads SVG class names', t => {
  const { document, engine } = fixture(t)
  const fragment = document.createDocumentFragment()
  const html = document.createElement('div')
  html.className = 'foo bar'
  const partial = document.createElement('div')
  partial.className = 'foo'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'foo bar')
  fragment.append(html, partial, svg)

  assert.deepEqual(Array.from(engine.byClass('foo bar', fragment)), [html, svg])
  assert.deepEqual(Array.from(engine.byClass('bar', fragment)), [html, svg])
})
