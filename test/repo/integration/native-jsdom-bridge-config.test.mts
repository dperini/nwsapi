import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'route planner and cache configuration reaches the Rust host snapshot',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><section class=pick><i></i></section></main>',
    )
    try {
      let routePlanner: boolean | undefined
      let cacheLimit: number | undefined
      let cacheBytes: number | undefined
      let routePlannerHost: string | undefined
      const native = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              routePlanner = args[7]
              cacheLimit = args[8]
              cacheBytes = args[9]
              routePlannerHost = args[10]
              return binding.queryHost(...args)
            },
          },
        },
      )
      native.engine.configure({
        ROUTE_PLANNER: false,
        CACHE_LIMIT: 0,
        CACHE_BYTES: 0,
      })
      assert.deepEqual(
        native.querySelectorAll('.pick', window.document).length,
        1,
      )
      assert.equal(routePlanner, false)
      assert.equal(routePlannerHost, 'jsdom')
      assert.equal(cacheLimit, 0)
      assert.equal(cacheBytes, 0)

      native.engine.configure({
        ROUTE_PLANNER: true,
        CACHE_LIMIT: 4096,
        CACHE_BYTES: 4 * 1024 * 1024,
      })
      native.querySelectorAll('.pick', window.document)
      assert.equal(routePlanner, true)
      native.engine.useRoutePlanner('jsdom')
      native.querySelectorAll('.pick', window.document)
      assert.equal(routePlannerHost, 'jsdom')
      native.engine.useRoutePlanner(null)
      native.querySelectorAll('.pick', window.document)
      assert.equal(routePlanner, false)
      assert.equal(routePlannerHost, undefined)
      native.engine.useRoutePlanner('chromium')
      native.querySelectorAll('.pick', window.document)
      assert.equal(routePlanner, true)
      assert.equal(routePlannerHost, 'chromium')
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'run forwards directly mutated Config options to the Rust bridge',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><section class=pick><i></i></section></main>',
    )
    try {
      let forwarded:
        | [boolean | undefined, number | undefined, number | undefined]
        | undefined
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              forwarded = [args[7], args[8], args[9]]
              return binding.queryHost(...args)
            },
          },
        },
      )
      adapter.engine.Config.ROUTE_PLANNER = false
      adapter.engine.Config.CACHE_LIMIT = 0
      adapter.engine.Config.CACHE_BYTES = 0

      const results = adapter.run(
        'select',
        '.pick',
        window.document,
        undefined,
        [],
      )
      assert.equal(results.length, 1)
      assert.deepEqual(forwarded, [false, 0, 0])
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'stylesheet checks match supported branches through Rust and preserve their AST',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p id=target class=chosen data-kind=primary></p></main>',
    )
    try {
      const document = window.document
      let rustCalls = 0
      let supportCalls = 0
      const native = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            supportsHostSelector: (...args) => {
              supportCalls++
              return binding.supportsHostSelector(...args)
            },
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              rustCalls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      const fallback = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
      )
      const selector = 'p, .chosen, [data-kind=primary], p::before'
      assert.equal(native.engine.configure()['LEGACY'], false)
      assert.equal(native.engine.configure()['NODE_LIST'], false)
      const actual = native.check(selector, document.getElementById('target'))
      const expected = fallback.check(
        selector,
        document.getElementById('target'),
      )
      const css = require('css-tree') as {
        generate(node: unknown): string
      }

      assert.equal(actual.match, true)
      assert.equal(expected.match, true)
      assert.equal(supportCalls, 3)
      assert.equal(rustCalls, 3)
      assert.equal(css.generate(actual.ast!), css.generate(expected.ast!))
      assert.equal(actual.ast?.children?.size, 3)

      native.engine.configure({ NODE_LIST: true })
      const nodeListConfigured = native.check(
        selector,
        document.getElementById('target'),
      )
      assert.equal(nodeListConfigured.match, true)
      assert.equal(rustCalls, 6)
      const nodeListResult = native.querySelectorAll('.chosen', document)
      assert.equal(nodeListResult instanceof window.NodeList, true)
      const nodeList = nodeListResult as NodeListOf<Element>
      assert.deepEqual(Array.from(nodeList), [
        document.getElementById('target'),
      ])
      assert.equal(nodeList.item(0), document.getElementById('target'))
      const forEachNodes: Element[] = []
      nodeList.forEach(node => forEachNodes.push(node))
      assert.deepEqual(forEachNodes, [document.getElementById('target')])
      assert.deepEqual(Array.from(nodeList.keys()), [0])
      assert.deepEqual(Array.from(nodeList.entries()), [
        [0, document.getElementById('target')],
      ])
      assert.equal(supportCalls, 7)
      assert.equal(rustCalls, 7)
    } finally {
      window.close()
    }
  },
)
