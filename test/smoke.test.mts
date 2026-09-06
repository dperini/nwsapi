import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const factory = require('../src/nwsapi')

test('CommonJS factory supports selection, matching, and mutations', () => {
  const { window } = new JSDOM(
    '<!doctype html><div id=d><p id=a class=x></p><p id=b></p></div>',
  )
  try {
    const nw = factory({
      document: window.document,
      DOMException: window.DOMException,
    })
    const select = () => nw.select('div > p.x').map(e => e.id)
    assert.deepEqual(select(), ['a'])
    assert.equal(
      nw.match('div > p.x', window.document.getElementById('a')),
      true,
    )
    window.document.getElementById('b').className = 'x'
    assert.deepEqual(select(), ['a', 'b'])
    assert.deepEqual(select(), ['a', 'b'])
  } finally {
    window.close()
  }
})
