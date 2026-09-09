import type * as NodeFs from 'node:fs'
import type * as NodePath from 'node:path'
import type * as NodeVm from 'node:vm'
import type * as Jsdom from 'jsdom'
import type * as NwsapiModule from '../../../dist/nwsapi.js'
const __dirname = import.meta.dirname
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
const { readFileSync } = require('node:fs') as typeof NodeFs
const { join } = require('node:path') as typeof NodePath
import { test } from 'vitest'
const vm = require('node:vm') as typeof NodeVm
const { JSDOM } = require('jsdom') as typeof Jsdom
const source = readFileSync(join(__dirname, '../../../dist/nwsapi.js'), 'utf8')

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
] as const) {
  test(selector, () => {
    const { window } = new JSDOM(
      '<!doctype html><div id=a class=a><span class=a><i class=b></i></span></div><div id=b class=b></div><div id=c class=a></div>',
    )
    try {
      const nw = (
        require('../../../dist/nwsapi') as typeof NwsapiModule.default
      )(window)
      const expected = [...window.document.querySelectorAll(selector)]
      assert.deepEqual(nw.select(selector), expected)
      assert.deepEqual(nw.select(selector), expected, 'cached selection')
    } finally {
      window.close()
    }
  })
}
