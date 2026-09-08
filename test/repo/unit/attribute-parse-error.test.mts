import type * as Jsdom from 'jsdom'
import type * as NwsapiModule from '../../../src/nwsapi.js'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
import { test, type TestContext } from 'vitest'
const { JSDOM } = require('jsdom') as typeof Jsdom
const factory = require('../../../src/nwsapi.js') as typeof NwsapiModule.default

function fixture(t: TestContext) {
  const { window } = new JSDOM(
    '<!doctype html><meta id="encoding" charset="utf-8">' +
      '<body><div id="a" class="x"></div><div id="b"></div>',
  )
  t.onTestFinished(() => window.close())
  return {
    document: window.document,
    nw: factory({
      document: window.document,
      DOMException: window.DOMException,
    }),
  }
}

for (const quote of ['"', "'"] as const) {
  for (const newline of ['\n', '\r', '\r\n', '\f'] as const) {
    const attribute = '[class=' + quote + 'x' + newline + quote + ']'
    const selector = 'div' + attribute
    test('invalid attribute string: ' + JSON.stringify(selector), t => {
      const { document, nw } = fixture(t)
      const target = document.getElementById('a')
      for (let i = 0; i < 2; i++) {
        assert.throws(() => nw.select(selector, document), {
          name: 'SyntaxError',
        })
        assert.throws(() => nw.first(selector, document), {
          name: 'SyntaxError',
        })
        assert.throws(() => nw.match(attribute, target!), {
          name: 'SyntaxError',
        })
        assert.throws(() => nw.match(selector, target!), {
          name: 'SyntaxError',
        })
      }
    })
    test('quiet invalid attribute string: ' + JSON.stringify(selector), t => {
      const { document, nw } = fixture(t)
      nw.configure({ VERBOSITY: false, LOGERRORS: false })
      assert.deepEqual(nw.select(selector, document), [])
      assert.equal(nw.first(selector, document), null)
      assert.equal(nw.match(attribute, document.getElementById('a')!), false)
      assert.equal(nw.match(selector, document.getElementById('a')!), false)
    })
  }
}

for (const [selector, expected] of [
  ['meta[charset="utf-8"', ['encoding']],
  ['meta[charset="utf-8', ['encoding']],
  ['div:not([class]', ['b']],
  ['div:not([class', ['b']],
  ['div:is([class="x"', ['a']],
  ['div\n[class="x"]', []],
  ['div[class="\\78 "]', ['a']],
] as const) {
  test('valid selector: ' + JSON.stringify(selector), t => {
    const { document, nw } = fixture(t)
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(
        Array.from(nw.select(selector!, document)).map(e => e.id),
        expected,
      )
      assert.equal(
        nw.match(selector!, document.getElementById('a')!),
        (expected as readonly string[]).includes('a'),
      )
    }
  })
}

// Every CSS newline form is a valid continuation after a backslash in a string.
for (const newline of ['\n', '\r', '\r\n', '\f'] as const) {
  test('valid line continuation: ' + JSON.stringify(newline), t => {
    const { document, nw } = fixture(t)
    assert.deepEqual(
      Array.from(nw.select('div[class="x\\' + newline + '"]', document)).map(
        e => e.id,
      ),
      ['a'],
    )
  })
}

import stringCases from './fixtures/attribute-string-cases.mts'
for (const { name, selector, value, valid = true } of stringCases) {
  test(name, t => {
    const { document, nw } = fixture(t)
    const target = document.getElementById('a')
    target!.setAttribute('data-x', value)
    for (let i = 0; i < 2; ++i) {
      if (valid) {
        assert.deepEqual(
          Array.from(nw.select(selector, document)).map(e => e.id),
          ['a'],
        )
        assert.equal(nw.first(selector, document), target)
        assert.equal(nw.match(selector, target!), true)
        assert.equal(nw.match(selector, document.getElementById('b')!), false)
      } else {
        assert.throws(() => nw.select(selector, document), {
          name: 'SyntaxError',
        })
        assert.throws(() => nw.first(selector, document), {
          name: 'SyntaxError',
        })
        assert.throws(() => nw.match(selector, target!), {
          name: 'SyntaxError',
        })
      }
    }
  })
}
