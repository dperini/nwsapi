const __dirname = import.meta.dirname
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
import { test } from 'vitest'
const vm = require('node:vm')
const { JSDOM } = require('jsdom')
const source = readFileSync(join(__dirname, '../../../src/nwsapi.js'), 'utf8')

test('strict factory initialization does not leak parser variables', () => {
  const context = {
    module: { exports: {} as (host: unknown) => unknown },
    exports: {},
  }
  vm.runInNewContext('"use strict";\n' + source, context)
  const { window } = new JSDOM('<!doctype html><div></div>')
  try {
    assert.doesNotThrow(() => context.module.exports(window))
    assert.equal(Object.hasOwn(context, 'parenthesized'), false)
  } finally {
    window.close()
  }
})

for (const selector of [
  'div:not(:nth-of-type(2n))',
  'div:not(:nth-child(3))',
  'div:is(.a):not(:where(.b))',
  'div:not(:not(:not(span)))',
  'div:has(:is(.a .b))',
]) {
  test(selector, () => {
    const { window } = new JSDOM(
      '<!doctype html><div id=a class=a><span class=a><i class=b></i></span></div><div id=b class=b></div><div id=c class=a></div>',
    )
    try {
      const nw = require('../../../src/nwsapi')(window)
      const expected = [...window.document.querySelectorAll(selector)]
      assert.deepEqual(nw.select(selector), expected)
      assert.deepEqual(nw.select(selector), expected, 'cached selection')
    } finally {
      window.close()
    }
  })
}
