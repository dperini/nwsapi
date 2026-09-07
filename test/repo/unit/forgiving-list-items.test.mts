import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
import { test } from 'vitest'
const { JSDOM } = require('jsdom')
const factory = require('../../../src/nwsapi.js')

import { markup, cases } from './fixtures/forgiving-cases.mts'

function fixture(t) {
  const { window } = new JSDOM(markup)
  t.onTestFinished(() => window.close())
  return { document: window.document, nw: factory(window) }
}

for (const [selector, expected] of cases) {
  test(selector, t => {
    const { document, nw } = fixture(t)
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(
        nw.select(selector, document).map(e => e.id),
        expected,
      )
      assert.equal(nw.first(selector, document)?.id, expected[0])
      for (const id of ['d', 'p', 'q']) {
        assert.equal(
          nw.match(selector, document.getElementById(id)),
          expected.includes(id),
          id,
        )
      }
    }
  })
}

test('changing FORGIVING invalidates cached match and select resolvers', t => {
  const { document, nw } = fixture(t)
  const selector = 'p:is(svg|p, #p)'
  for (let repeat = 0; repeat < 2; repeat++) {
    nw.configure({ FORGIVING: true })
    assert.deepEqual(
      nw.select(selector, document).map(e => e.id),
      ['p'],
    )
    assert.equal(nw.match(selector, document.getElementById('p')), true)
    nw.configure({ FORGIVING: false })
    assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' })
    assert.throws(() => nw.match(selector, document.getElementById('p')), {
      name: 'SyntaxError',
    })
  }
})

test('unforgiving and top-level invalid lists still throw', t => {
  const { document, nw } = fixture(t)
  for (const selector of ['svg|p', 'p,', 'p:not(svg|p, p)']) {
    assert.throws(() => nw.select(selector, document), { name: 'SyntaxError' })
  }
})

test('hexadecimal class escapes', t => {
  const { document, nw } = fixture(t)
  assert.equal(nw.match('p.a\\2c b', document.getElementById('p')), true)
})
