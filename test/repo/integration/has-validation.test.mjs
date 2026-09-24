import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const source = readFileSync(
  process.env['NWSAPI_TEST_SOURCE'] ||
    new URL('../../../src/nwsapi.js', import.meta.url),
  'utf8',
)

function fixture(t) {
  const { window } = new JSDOM(
    '<!doctype html><div id="parent"><span id="child"></span></div>',
    {
      runScripts: 'outside-only',
    },
  )
  t.after(() => window.close())
  window.eval(source)
  const engine = window.NW.Dom
  engine.install()
  return { window, document: window.document, engine }
}

for (const selector of [
  ':has()',
  ':has(123)',
  ':has(span, 123)',
  ':has(123, span)',
  ':has(, span)',
  ':has(span,)',
  ':has(:has(*))',
  ':has(span:has(*))',
  ':has(:not(:has(*)))',
  ':not(:has(123))',
  ':has(::before)',
  ':has(:before)',
  ':has(:unknown)',
]) {
  test(`${selector} throws before visiting candidates in every selector API`, t => {
    const { window, document, engine } = fixture(t)
    const empty = document.createElement('section')
    const parent = document.getElementById('parent')
    const contexts = [
      document,
      document.implementation.createHTMLDocument(''),
      parent,
      empty,
      document.createDocumentFragment(),
    ]
    for (let repeat = 0; repeat < 2; repeat += 1) {
      for (const context of contexts) {
        for (const query of [
          () => context.querySelector(selector),
          () => context.querySelectorAll(selector),
          () => engine.select(selector, context),
          () => engine.first(selector, context),
        ]) {
          assert.throws(
            query,
            error =>
              error instanceof window.DOMException &&
              error.name === 'SyntaxError',
          )
        }
      }
      for (const element of [parent, empty]) {
        assert.throws(() => element.matches(selector), { name: 'SyntaxError' })
        assert.throws(() => element.closest(selector), { name: 'SyntaxError' })
        assert.throws(() => engine.match(selector, element), {
          name: 'SyntaxError',
        })
      }
    }
    assert.equal(parent.matches(':has(> span)'), true)
  })
}

for (const pseudo of ['is', 'where']) {
  test(`:has() discards nested branches only inside forgiving :${pseudo}()`, t => {
    const { document, engine } = fixture(t)
    const parent = document.getElementById('parent')
    for (const invalid of [':has(*)', ':not(:has(*))', '::before']) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        assert.equal(parent.matches(`:has(:${pseudo}(${invalid}))`), false)
        const selector = `div:has(:${pseudo}(${invalid}, span))`
        assert.equal(parent.matches(selector), true)
        assert.deepEqual(Array.from(document.querySelectorAll(selector)), [
          parent,
        ])
      }
    }
    assert.equal(
      parent.matches(`:has(:${pseudo}(:where(:has(*)), span))`),
      true,
    )
    const selector = `div:has(:${pseudo}(:has(*), span))`
    engine.configure({ FORGIVING: false })
    assert.throws(() => document.createElement('div').querySelector(selector), {
      name: 'SyntaxError',
    })
    assert.throws(() => parent.matches(selector), { name: 'SyntaxError' })
    engine.configure({ FORGIVING: true })
    assert.equal(parent.matches(selector), true)
  })
}

test('wildcard namespaces work on either side of :has()', t => {
  const { document } = fixture(t)
  const parent = document.getElementById('parent')
  for (const selector of [
    '*|*:has(> span)',
    'div:has(*|*)',
    'div:has(> *|span)',
    '*|div:has(> *|*)',
  ]) {
    for (let repeat = 0; repeat < 2; repeat += 1) {
      assert.deepEqual(Array.from(document.querySelectorAll(selector)), [
        parent,
      ])
      assert.equal(parent.matches(selector), true)
    }
  }
})

test('quoted and escaped pseudo text stays literal inside :has()', t => {
  const { document } = fixture(t)
  const parent = document.getElementById('parent')
  const child = document.getElementById('child')
  child.setAttribute('data-value', ':has(*), ::before')
  child.className = ':has(*)'
  for (const selector of [
    'div:has(> [data-value=":has(*), ::before"])',
    "div:has(> [data-value=':has(*), ::before'])",
    String.raw`div:has(> .\:has\(\*\))`,
    'div:has(> :is(:has(*), [data-value=":has(*), ::before"]))',
  ]) {
    assert.deepEqual(Array.from(document.querySelectorAll(selector)), [parent])
    assert.equal(parent.matches(selector), true)
  }
})

test('quiet validation rejects the entire argument list and preserves verbose retries', t => {
  const { document, engine } = fixture(t)
  const parent = document.getElementById('parent')
  for (const selector of [
    'div:has()',
    'div:has(span, 123)',
    'div:has(123, span)',
    'div:has(:has(*), span)',
    'div:not(:has(123))',
  ]) {
    for (let repeat = 0; repeat < 2; repeat += 1) {
      engine.configure({ VERBOSITY: false, LOGERRORS: false })
      assert.deepEqual(Array.from(engine.select(selector)), [])
      assert.equal(engine.match(selector, parent), false)
      engine.configure({ VERBOSITY: true })
      assert.throws(() => engine.select(selector), { name: 'SyntaxError' })
      assert.throws(() => engine.match(selector, parent), {
        name: 'SyntaxError',
      })
    }
  }
  assert.equal(parent.matches(':has(> span)'), true)
})
