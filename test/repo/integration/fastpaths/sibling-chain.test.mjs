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
  return { window, document: window.document, engine: window.NW.Dom }
}

test('simple general-sibling chains scan a candidate parent once', t => {
  const { window, document, engine } = fixture(t)
  const parent = document.querySelector('main')
  parent.append(document.createElement('i'), document.createElement('b'))
  parent.firstElementChild.className = 'start'
  parent.lastElementChild.className = 'middle'
  for (let i = 0; i < 600; ++i) {
    const child = document.createElement('span')
    child.className = 'end'
    parent.append(child)
  }

  const expected = Array.from(document.querySelectorAll('.start ~ .middle ~ .end'))
  const elementPrototype = window.Element.prototype
  const next = Object.getOwnPropertyDescriptor(elementPrototype, 'nextElementSibling')
  const previous = Object.getOwnPropertyDescriptor(elementPrototype, 'previousElementSibling')
  let nextReads = 0
  let previousReads = 0
  Object.defineProperty(elementPrototype, 'nextElementSibling', {
    configurable: true,
    get() {
      nextReads++
      return next.get.call(this)
    },
  })
  Object.defineProperty(elementPrototype, 'previousElementSibling', {
    configurable: true,
    get() {
      previousReads++
      return previous.get.call(this)
    },
  })
  t.after(() => {
    Object.defineProperty(elementPrototype, 'nextElementSibling', next)
    Object.defineProperty(elementPrototype, 'previousElementSibling', previous)
  })

  const actual = engine.select('.start ~ .middle ~ .end', document)
  assert.deepEqual(Array.from(actual), expected)
  assert.ok(nextReads <= parent.children.length + 1)
  assert.equal(previousReads, 0)
})

test('sibling-chain fast path declines pseudo, attribute, escaped, and callback queries', t => {
  const { document, engine } = fixture(t)
  const parent = document.querySelector('main')
  parent.innerHTML = '<i class="start"></i><b class="middle" data-x="1"></b><span class="end"></span>'

  for (const selector of [
    '.start:hover ~ .middle ~ .end',
    '.start ~ [data-x] ~ .end',
    '.start\\20x ~ .middle ~ .end',
  ]) {
    assert.deepEqual(
      Array.from(engine.select(selector, document)),
      Array.from(document.querySelectorAll(selector)),
    )
  }

  const visited = []
  const results = engine.select('.start ~ .middle ~ .end', document, element => {
    visited.push(element)
  })
  assert.deepEqual(Array.from(results), Array.from(document.querySelectorAll('.start ~ .middle ~ .end')))
  assert.deepEqual(visited, Array.from(results))
})
