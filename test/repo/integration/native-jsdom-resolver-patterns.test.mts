import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

import { nativeCustomOperatorForSelector } from '../../../src/adapter/native/resolver.mts'

// eslint-disable-next-line complexity -- The test keeps the operator pattern matrix and Rust routing assertions together.
test.skipIf(!addon)(
  'literal registered attribute patterns execute in Rust',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p id="match" data-value="prefixYessuffix" data-anchor="prefixYessuffix"></p>' +
        '<p id="other" data-value="prefixNosuffix" data-anchor="prefixNosuffix"></p>' +
        '<p id="embedded" data-value="prefixNosuffix" data-anchor="xprefixYessuffixz"></p>' +
        '<a id="escaped" data-url="https://site.test/index.html"></a>' +
        '<p id="digits" data-number="item12x" data-numeric="12x" data-spaced="12  \t"></p></main>',
    )
    try {
      let hostCalls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              hostCalls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      adapter.engine.registerOperator('@=', {
        p1: 'prefix',
        p2: 'suffix',
        p3: 'true',
      })
      adapter.engine.registerOperator('?=', {
        p1: 'prefix',
        p2: 'suffix',
        p3: 'false',
      })
      adapter.engine.registerOperator('%=', {
        p1: '^prefix',
        p2: 'suffix$',
        p3: 'true',
      })
      adapter.engine.registerOperator('&=', {
        p1: '^https://site\\x2etest/',
        p2: '\\u002ehtml$',
        p3: 'true',
      })
      adapter.engine.registerOperator('/=', {
        p1: '^\\w+',
        p2: '',
        p3: 'true',
      })
      adapter.engine.registerOperator('>=', {
        p1: '',
        p2: '\\s+$',
        p3: 'true',
      })
      adapter.engine.registerOperator('<=', {
        p1: '^item\\d+',
        p2: '$',
        p3: 'true',
      })
      adapter.engine.registerOperator('#=', {
        p1: '^item\\d*',
        p2: '$',
        p3: 'true',
      })
      const selector = 'p[data-value@="Yes"]'
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(selector, window.document),
          node => node.id,
        ),
        ['match'],
      )
      assert.equal(hostCalls, 1)
      const negativeSelector = 'p[data-value?="Yes"]'
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(negativeSelector, window.document),
          node => node.id,
        ),
        ['other', 'embedded', 'digits'],
      )
      assert.equal(hostCalls, 2)
      const anchoredSelector = 'p[data-anchor%="Yes"]'
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(anchoredSelector, window.document),
          node => node.id,
        ),
        ['match'],
      )
      assert.equal(hostCalls, 3)
      const multipleOperators = 'p[data-value@="Yes"][data-anchor%="Yes"]'
      const beforeMultipleOperators = hostCalls
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(multipleOperators, window.document),
          node => node.id,
        ),
        ['match'],
      )
      assert.equal(hostCalls, beforeMultipleOperators + 1)
      const escapedSelector = 'a[data-url&="index"]'
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(escapedSelector, window.document),
          node => node.id,
        ),
        ['escaped'],
      )
      assert.equal(hostCalls, beforeMultipleOperators + 2)
      adapter.engine.Operators['&='] = { p1: '^', p2: '\\$', p3: 'true' }
      const price = window.document.getElementById('escaped')!
      price.setAttribute('data-price', '20$ USD')
      const priceSelector = 'a[data-price&="20"]'
      const beforePrice = hostCalls
      assert.deepEqual(adapter.engine.select(priceSelector, window.document), [
        price,
      ])
      assert.deepEqual(
        adapter.querySelectorAll(priceSelector, window.document),
        [price],
      )
      assert.equal(hostCalls, beforePrice + 1)
      const digitsClassSelector = 'p[data-numeric/="x"]'
      const beforeDigitsClass = hostCalls
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(digitsClassSelector, window.document),
          node => node.id,
        ),
        ['digits'],
      )
      assert.equal(hostCalls, beforeDigitsClass + 1)
      const spaceClassSelector = 'p[data-spaced>="12"]'
      const beforeSpaceClass = hostCalls
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(spaceClassSelector, window.document),
          node => node.id,
        ),
        ['digits'],
      )
      assert.equal(hostCalls, beforeSpaceClass + 1)
      const composedRegexSelector = 'p[data-number<="x"]'
      const beforeComposedRegex = hostCalls
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(composedRegexSelector, window.document),
          node => node.id,
        ),
        ['digits'],
      )
      assert.equal(hostCalls, beforeComposedRegex + 1)
      adapter.engine.Operators['<='] = {
        p1: '^\\w+\\d+',
        p2: '\\s+\\w+$',
        p3: 'true',
      }
      price.setAttribute('data-code', 'item12x abc')
      for (const value of ['x', '2x', 'missing']) {
        const query = `a[data-code<="${value}"]`
        const before: number = hostCalls
        assert.deepEqual(
          adapter.querySelectorAll(query, window.document),
          adapter.engine.select(query, window.document),
        )
        assert.equal(hostCalls, before + 1)
      }
      const optionalDigitsSelector = 'p[data-number#="x"]'
      const beforeOptionalDigits = hostCalls
      assert.equal(
        nativeCustomOperatorForSelector(adapter.engine, optionalDigitsSelector),
        '#=G1^6974656d!d:$;',
      )
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(optionalDigitsSelector, window.document),
          node => node.id,
        ),
        ['digits'],
      )
      assert.equal(hostCalls, beforeOptionalDigits + 1)
      window.document
        .getElementById('digits')!
        .setAttribute('data-number', 'itemx')
      const beforeEmptyDigitRun = hostCalls
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(optionalDigitsSelector, window.document),
          node => node.id,
        ),
        ['digits'],
      )
      assert.equal(hostCalls, beforeEmptyDigitRun + 1)
      window.document
        .getElementById('digits')!
        .setAttribute('data-number', 'item12x')
      adapter.engine.Operators['#='] = {
        p1: '^caf\\xE9\\uD83D\\uDCA1',
        p2: '$',
        p3: 'true',
      }
      price.setAttribute('data-code', 'café💡x')
      const unicodeRegexSelector = 'a[data-code#="x"]'
      assert.equal(
        nativeCustomOperatorForSelector(adapter.engine, unicodeRegexSelector),
        '#=G1^636166!u00e9!ud83d!udca1:$;',
      )
      const beforeUnicodeRegex = hostCalls
      assert.deepEqual(
        adapter.querySelectorAll(unicodeRegexSelector, window.document),
        [price],
      )
      assert.equal(hostCalls, beforeUnicodeRegex + 1)
      adapter.engine.Operators['#='] = { p1: '^', p2: '💡$', p3: 'true' }
      price.setAttribute('data-suffix', 'x💡')
      const unicodeSuffixSelector = 'a[data-suffix#="x"]'
      const beforeUnicodeSuffix = hostCalls
      assert.deepEqual(
        adapter.querySelectorAll(unicodeSuffixSelector, window.document),
        [price],
      )
      assert.equal(hostCalls, beforeUnicodeSuffix + 1)
      window.document
        .querySelector('#other')!
        .setAttribute('data-unicode', 'café')
      const beforeUnicodeAttributeValue = hostCalls
      assert.deepEqual(
        adapter.querySelectorAll(selector, window.document),
        adapter.engine.select(selector, window.document),
      )
      assert.equal(hostCalls, beforeUnicodeAttributeValue + 1)
    } finally {
      window.close()
    }
  },
)
