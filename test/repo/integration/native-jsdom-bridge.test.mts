// max-file-lines: cases — Keeps bridge contract cases in one test fixture.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import { queryNativeHost } from '../../../src/adapter/native-query.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)('clear(true) clears the native host plan cache', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const { window } = new JSDOM('<!doctype html><main></main>')
  try {
    let clears = 0
    const adapter = new DOMSelector(
      window as unknown as Window & typeof globalThis,
      window.document,
      {
        nativeQuery: {
          ...binding,
          clearPlanCache() {
            clears++
            binding.clearPlanCache?.()
          },
        },
      },
    )
    adapter.clear()
    assert.equal(clears, 0)
    adapter.clear(true)
    assert.equal(clears, 1)
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'host snapshots keep nested shadow trees isolated from document queries',
  () => {
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><x-host></x-host></main>',
    )
    try {
      const document = window.document
      const host = document.querySelector('x-host')!
      const shadow = host.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<span class="inside"></span>'

      assert.deepEqual(
        queryNativeHost(binding, document, 'select', '.inside', document),
        [],
      )
      assert.deepEqual(
        queryNativeHost(binding, document, 'select', '.inside', shadow),
        [shadow.querySelector('.inside')],
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'host-context crosses nested shadow hosts without attaching detached hosts',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main class=outer><x-outer></x-outer></main>',
    )
    try {
      const document = window.document
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, document, { nativeQuery: binding })
      const fallback = new DOMSelector(host, document)
      const outer = document.querySelector('x-outer')!
      const outerShadow = outer.attachShadow({ mode: 'open' })
      outerShadow.innerHTML = '<section><x-inner></x-inner></section>'
      const inner = outerShadow.querySelector('x-inner')!
      const innerShadow = inner.attachShadow({ mode: 'open' })
      innerShadow.innerHTML = '<slot></slot>'
      const selector = ':host-context(.outer) > slot'
      assert.deepEqual(
        native.querySelectorAll(selector, innerShadow),
        fallback.querySelectorAll(selector, innerShadow),
      )
      assert.deepEqual(native.querySelectorAll(selector, innerShadow), [
        innerShadow.querySelector('slot'),
      ])

      const detached = document.createElement('x-detached')
      const detachedShadow = detached.attachShadow({ mode: 'open' })
      detachedShadow.innerHTML = '<slot></slot>'
      assert.deepEqual(
        native.querySelectorAll(':host-context(body) > slot', detachedShadow),
        fallback.querySelectorAll(':host-context(body) > slot', detachedShadow),
      )
      assert.deepEqual(
        native.querySelectorAll(':host-context(body) > slot', detachedShadow),
        [],
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'custom bulk :has planners run inside the native query bridge',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const anchors = Array.from(
      { length: 40 },
      (_, index) =>
        `<section id="anchor-${index}" class="anchor" data-ok="1">` +
        '<i class="witness"></i><i class="witness"></i><i class="witness"></i></section>',
    ).join('')
    const { window } = new JSDOM(`<!doctype html><main>${anchors}</main>`)
    try {
      const bridgeCallbacks: string[] = []
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              bridgeCallbacks.push(typeof args[14])
              return binding.queryHost(...args)
            },
          },
        },
      )
      const calls: Array<[number, number, number, number, number]> = []
      adapter.engine.registerBulkHasPlanner(
        (anchorCount, witnessCount, attributes, dense, ratio) => {
          calls.push([anchorCount, witnessCount, attributes, dense, ratio])
          return true
        },
      )
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(
            '.anchor[data-ok="1"]:has(.witness)',
            window.document,
          ),
          element => element.id,
        ),
        Array.from({ length: 40 }, (_, index) => `anchor-${index}`),
      )
      assert.deepEqual(bridgeCallbacks, ['function'])
      assert.deepEqual(calls, [[40, 120, 2, 0, 3]])
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native plan caches keep separately loaded adapters isolated',
  () => {
    const path = require.resolve('../../../dist/adapter/dom-selector.js')
    const savedModule = require.cache[path]
    function loadAdapter(): DOMSelectorAdapter {
      delete require.cache[path]
      try {
        return require(path) as DOMSelectorAdapter
      } finally {
        if (savedModule) {
          require.cache[path] = savedModule
        } else {
          delete require.cache[path]
        }
      }
    }
    const FirstAdapter = loadAdapter()
    const SecondAdapter = loadAdapter()
    const binding = require(addon!) as NativeQueryBinding
    const firstDom = new JSDOM('<!doctype html><main><p></p></main>')
    const secondDom = new JSDOM('<!doctype html><main><p></p></main>')
    try {
      const firstCalls: Array<[number | undefined, number | undefined]> = []
      const secondCalls: Array<[number | undefined, number | undefined]> = []
      const cleared: Array<number | undefined> = []
      const sharedBinding: NativeQueryBinding = {
        ...binding,
        queryHost(...args) {
          const calls = args[8] === 0 ? firstCalls : secondCalls
          calls.push([args[8], args[13]])
          return binding.queryHost(...args)
        },
        clearPlanCache(cacheId) {
          cleared.push(cacheId)
          binding.clearPlanCache?.(cacheId)
        },
      }
      const first = new FirstAdapter(
        firstDom.window as unknown as Window & typeof globalThis,
        firstDom.window.document,
        { nativeQuery: sharedBinding },
      )
      const second = new SecondAdapter(
        secondDom.window as unknown as Window & typeof globalThis,
        secondDom.window.document,
        { nativeQuery: sharedBinding },
      )
      first.engine.configure({ CACHE_LIMIT: 0, CACHE_BYTES: 0 })
      second.engine.configure({ CACHE_LIMIT: 32, CACHE_BYTES: 8192 })
      assert.equal(
        first.querySelectorAll('p', firstDom.window.document).length,
        1,
      )
      assert.equal(
        second.querySelectorAll('p', secondDom.window.document).length,
        1,
      )
      assert.notEqual(firstCalls[0]?.[1], secondCalls[0]?.[1])
      assert.deepEqual(firstCalls[0], [0, firstCalls[0]?.[1]])
      assert.deepEqual(secondCalls[0], [32, secondCalls[0]?.[1]])
      const firstId = firstCalls[0]?.[1]
      const secondId = secondCalls[0]?.[1]
      assert.ok(firstId !== undefined && secondId !== undefined)
      first.clear(true)
      assert.deepEqual(cleared, [firstId])
      assert.notEqual(firstId, secondId)
    } finally {
      firstDom.window.close()
      secondDom.window.close()
    }
  },
)

test.skipIf(!addon)(
  'host queries respect document mode for class selectors',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    for (const doctype of ['', '<!doctype html>']) {
      const { window } = new JSDOM(
        doctype + '<main><p id="Pick" class="Mixed"></p><i></i></main>',
      )
      try {
        const host = window as unknown as Window & typeof globalThis
        const reference = new DOMSelector(host, window.document)
        let calls = 0
        const native = new DOMSelector(host, window.document, {
          nativeQuery: {
            ...binding,
            queryHost(...args) {
              calls++
              return binding.queryHost(...args)
            },
          },
        })
        const selectors = [
          'p',
          'main > p.mixed',
          'main > p.Mixed',
          '#Pick',
          '#pick',
          '[class="mixed"]',
          '[class="mixed" i]',
          'p.mixed, #Pick',
          'main:has(> .mixed)',
          'main :is(.mixed, i)',
          'main > :not(.Mixed)',
          'main > :nth-child(1 of .mixed)',
          'p.mixed + i',
        ]
        for (const selector of selectors) {
          assert.deepEqual(
            native.querySelectorAll(selector, window.document),
            reference.querySelectorAll(selector, window.document),
            selector,
          )
        }
        assert.equal(calls, selectors.length)
      } finally {
        window.close()
      }
    }
  },
)

test.skipIf(!addon)(
  'static configuration applies to both adapters on their first Rust query',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM('<!doctype html><p id=x></p><p id=x></p>')
    const host = window as unknown as Window & typeof globalThis
    try {
      const calls: unknown[][] = []
      const cleared: Array<number | undefined> = []
      const options = {
        nativeQuery: {
          ...binding,
          clearPlanCache(id?: number) {
            cleared.push(id)
            binding.clearPlanCache!(id)
          },
          queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
            calls.push([args[5], args[7], args[8], args[9], args[13]])
            return binding.queryHost(...args)
          },
        },
      }
      const first = new DOMSelector(host, window.document, options)
      const engine = first.engine
      DOMSelector.configure(host, {
        FORGIVING: false,
        IDS_DUPES: false,
        CACHE_LIMIT: 7,
      })
      DOMSelector.configure(host, { CACHE_BYTES: 8192, ROUTE_PLANNER: false })
      const second = new DOMSelector(host, window.document, options)
      assert.equal(second.engine, engine)
      for (const adapter of [first, second]) {
        assert.equal(adapter.querySelectorAll('#x', window.document).length, 1)
      }
      assert.equal(calls.length, 2)
      assert.equal(typeof calls[0]?.[4], 'number')
      assert.deepEqual(cleared, [calls[0]?.[4], calls[0]?.[4]])
      assert.deepEqual(
        calls,
        Array.from({ length: 2 }, () => [false, false, 7, 8192, calls[0]?.[4]]),
      )
      assert.throws(
        () => DOMSelector.configure(host, { IDS_DUPES: true }),
        /before its first use/,
      )
    } finally {
      window.close()
    }
  },
)
