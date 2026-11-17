import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const factory = require('../../../src/nwsapi.js')

function setup(t, html = '<!doctype html><input id="field"><button id="button">Go</button>') {
  const { window } = new JSDOM(html)
  t.after(() => window.close())
  const engine = factory(window)
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  return { window, engine }
}

test('issue 259: focus pseudos ignore the default body activeElement fallback', t => {
  const { window, engine } = setup(t)
  window.document.hasFocus = () => true

  for (const selector of [':focus', ':focus-visible', ':focus-within', ':active']) {
    assert.deepEqual(engine.select(selector, window.document), [], selector)
  }

  const input = window.document.querySelector('input')
  input.focus()
  for (const selector of [':focus', ':focus-visible']) {
    assert.deepEqual(engine.select(selector, window.document), [input], selector)
  }
  for (const selector of [':focus-within', ':active']) {
    assert.ok(engine.select(selector, window.document).includes(input), selector)
  }

  const body = window.document.body
  body.setAttribute('tabindex', '0')
  body.focus()
  for (const selector of [':focus', ':focus-visible', ':focus-within', ':active']) {
    assert.ok(engine.select(selector, window.document).includes(body), selector)
  }
})

test('issue 260: empty top-level selector-list items never match the document root', t => {
  const { window, engine } = setup(t, '<!doctype html><head></head><body><script></script></body>')

  for (const selector of [',head script', 'head,,script', 'head script,']) {
    assert.deepEqual(engine.select(selector, window.document), [], selector)
  }
  assert.equal(engine.select(':is(head,script)', window.document).length, 2)
})

test('issue 261: selector scans keep repeated accessibility-style ID queries cached', t => {
  const { window, engine } = setup(t)
  const selectors = Array.from({ length: 2300 }, (_, index) =>
    index % 2
      ? `[aria-labelledby~="generated-id-${index}"]`
      : `label[for="generated-id-${index}"]`,
  )
  const NativeFunction = globalThis.Function
  let compilations = 0
  globalThis.Function = function (...args) {
    ++compilations
    return NativeFunction(...args)
  }

  try {
    for (let pass = 0; pass < 4; ++pass) {
      for (const selector of selectors) engine.select(selector, window.document)
      if (pass === 0) assert.ok(compilations >= selectors.length)
    }
    assert.equal(compilations, selectors.length)
  } finally {
    globalThis.Function = NativeFunction
  }
})
