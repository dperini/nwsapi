import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'native queries bridge representable custom selector resolvers',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p data-score="2"></p><p></p></main>',
    )
    try {
      let hostCalls = 0
      let supportCalls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            supportsHostSelector: (...args) => {
              supportCalls++
              return binding.supportsHostSelector(...args)
            },
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              hostCalls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      adapter.engine.registerSelector(
        'jquery:custom',
        /^::custom(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      assert.equal(adapter.querySelectorAll('p', window.document).length, 2)
      assert.equal(hostCalls, 1)
      adapter.engine.registerSelector(
        'jquery:oddOverride',
        /^:odd(.*)/i,
        (match, source) => ({
          match,
          status: true,
          source: `if(false){${source}}`,
        }),
      )
      assert.equal(adapter.querySelectorAll('p:odd', window.document).length, 0)
      assert.equal(hostCalls, 2)
      adapter.engine.registerOperator('@=', {
        p1: '^',
        p2: '$',
        p3: 'true',
      })
      let customResolverCalls = 0
      adapter.engine.registerSelector(
        'firstCustom',
        /^:firstCustom(.*)/,
        (match, source) => {
          customResolverCalls++
          return { match, status: true, source }
        },
      )
      adapter.engine.registerSelector(
        'secondCustom',
        /^:secondCustom(.*)/,
        (match, source) => {
          customResolverCalls++
          return { match, status: true, source }
        },
      )
      const beforeFirstCustomSupport = supportCalls
      assert.equal(
        adapter.querySelectorAll(
          'p[data-score@="2"]:firstCustom',
          window.document,
        ).length,
        1,
      )
      assert.equal(customResolverCalls, 1)
      assert.equal(hostCalls, 2)
      assert.equal(supportCalls, beforeFirstCustomSupport)
      const beforeChainedCustomSupport = supportCalls
      assert.equal(
        adapter.querySelectorAll('p:firstCustom:secondCustom', window.document)
          .length,
        2,
      )
      assert.equal(customResolverCalls, 3)
      assert.equal(hostCalls, 2)
      assert.equal(supportCalls, beforeChainedCustomSupport)
      assert.equal(
        adapter.querySelectorAll('p::custom', window.document).length,
        2,
      )
      assert.equal(hostCalls, 3)
      assert.equal(
        adapter.querySelectorAll('p:not(::custom)', window.document).length,
        0,
      )
      assert.equal(hostCalls, 4)
      adapter.engine.registerSelector(
        'zeroWidth',
        /(?=p)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      assert.equal(adapter.querySelectorAll('p', window.document).length, 2)
      assert.equal(hostCalls, 4)
    } finally {
      window.close()
    }
  },
)
