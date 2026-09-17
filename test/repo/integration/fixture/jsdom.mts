import type * as Jsdom from 'jsdom'
import type { ConstructorOptions } from 'jsdom'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { type TestContext } from 'vitest'
import type createNwsapi from '../../../dist/nwsapi.js'

export const require = createRequire(
  new URL('../fixture-base.js', import.meta.url),
)

const jsdomRequire = createRequire(require.resolve('jsdom'))
export const factory: typeof createNwsapi = require('../../../dist/nwsapi.js')

export const { DOMSelector } = factory

const path = jsdomRequire.resolve('@asamuzakjp/dom-selector')
jsdomRequire(path)
require.cache[path]!.exports = factory

assert.equal(jsdomRequire('@asamuzakjp/dom-selector'), factory)

const { JSDOM } = jsdomRequire('jsdom') as typeof Jsdom

export function host(
  t: TestContext,
  html = '<!doctype html><section><div class="item" id="one"></div><div class="item" id="two"></div></section>',
  options?: ConstructorOptions,
) {
  const dom = new JSDOM(html, options)
  t.onTestFinished(() => dom.window.close())
  return dom.window
}
