import type * as Jsdom from 'jsdom'
import type * as NwsapiModule from '../../../src/nwsapi.js'
import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
const { JSDOM } = require('jsdom') as typeof Jsdom
const factory = require('../../../src/nwsapi') as typeof NwsapiModule.default

test('CommonJS factory supports selection, matching, and mutations', () => {
  const { window } = new JSDOM(
    '<!doctype html><div id=d><p id=a class=x></p><p id=b></p></div>',
  )
  try {
    const nw = factory({
      document: window.document,
      DOMException: window.DOMException,
    })
    const select = () => Array.from(nw.select('div > p.x')).map(e => e.id)
    assert.deepEqual(select(), ['a'])
    assert.equal(
      nw.match('div > p.x', window.document.getElementById('a')!),
      true,
    )
    window.document.getElementById('b')!.className = 'x'
    assert.deepEqual(select(), ['a', 'b'])
    assert.deepEqual(select(), ['a', 'b'])
  } finally {
    window.close()
  }
})
