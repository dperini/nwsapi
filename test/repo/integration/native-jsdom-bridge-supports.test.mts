import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'jsdom supports checks Rust first and falls back for JS extensions',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p class=good></p></main>',
    )
    try {
      let bindingUnavailable = false
      const grammarCalls: boolean[] = []
      const supportCalls: string[] = []
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            supportsHostOperatorGrammar(...args) {
              const accepted = binding.supportsHostOperatorGrammar!(...args)
              grammarCalls.push(accepted)
              return accepted
            },
            supportsHostSelector(...args) {
              const source = args[0]!
              supportCalls.push(String.fromCharCode(...source))
              if (bindingUnavailable) {
                throw new Error('Binding unavailable')
              }
              return binding.supportsHostSelector(...args)
            },
          },
        },
      )

      assert.equal(adapter.supports('p.good'), true)
      assert.deepEqual(supportCalls, ['p.good'])
      assert.equal(adapter.supports('p:unsupported-nwsapi-test'), false)
      assert.deepEqual(supportCalls, ['p.good', 'p:unsupported-nwsapi-test'])

      const originalOperators = adapter.engine.CFG.operators
      adapter.engine.CFG.operators = '='
      adapter.engine.configure({}, true)
      assert.equal(adapter.supports('[class^="go"]'), false)
      assert.deepEqual(supportCalls, ['p.good', 'p:unsupported-nwsapi-test'])
      assert.equal(adapter.supports('[class="good"]'), true)
      assert.deepEqual(grammarCalls, [false, true])
      adapter.engine.CFG.operators = originalOperators
      adapter.engine.configure({}, true)
      assert.equal(adapter.supports('[class^="go"]'), true)
      assert.equal(supportCalls.pop(), '[class^="go"]')

      adapter.engine.registerSelector(
        'jsOnly',
        /^:jsOnly(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      assert.equal(adapter.supports(':jsOnly'), true)
      assert.deepEqual(supportCalls, [
        'p.good',
        'p:unsupported-nwsapi-test',
        ':jsOnly',
      ])
      bindingUnavailable = true
      assert.equal(adapter.supports('main > p'), true)
      assert.equal(adapter.supports('['), false)
      assert.deepEqual(supportCalls.slice(-2), ['main > p', '['])
      bindingUnavailable = false
      const callsBeforeHook = supportCalls.length
      const expression = /unused/
      expression.exec = value => /^:pluginHook(.*)/.exec(value)
      adapter.engine.registerSelector('hook', expression, (match, source) => ({
        match,
        status: true,
        source,
      }))
      assert.equal(adapter.supports(':pluginHook'), true)
      assert.equal(supportCalls.length, callsBeforeHook)
      assert.equal(
        adapter.querySelector('p:pluginHook', window.document),
        window.document.getElementsByTagName('p')[0],
      )
    } finally {
      window.close()
    }
  },
)
