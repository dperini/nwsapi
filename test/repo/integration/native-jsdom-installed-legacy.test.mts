import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)('legacy installed queries use supported Rust paths', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const installLegacy = require('../../../dist/modules/nwsapi-legacy.js') as (
    engine: object,
  ) => unknown
  const { window } = new JSDOM('<!doctype html><main><p></p></main>')
  try {
    let traversalForgiving: boolean | undefined
    let hostCalls = 0
    const adapter = new DOMSelector(
      window as unknown as Window & typeof globalThis,
      window.document,
      {
        nativeQuery: {
          supportsHostSelector: (...args) =>
            binding.supportsHostSelector(...args),
          queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
            if (args[0].startsWith('traverse:')) {
              traversalForgiving = args[5]
            }
            hostCalls++
            return binding.queryHost(...args)
          },
        },
      },
    )
    const engine = adapter.engine
    installLegacy(engine)
    engine.configure({ LEGACY: true })
    adapter.install()

    const p = window.document.querySelector('p')
    assert.ok(p)
    assert.deepEqual(Array.from(window.document.querySelectorAll('p')), [p])
    assert.ok(p.matches('p'))
    const traversalFile =
      require.resolve('../../../dist/modules/nwsapi-traversal.js')
    runInNewContext(readFileSync(traversalFile, 'utf8'), {
      NW: { Dom: engine },
      document: window.document,
    })
    const main = window.document.querySelector('main')!
    assert.equal(engine.down!(main, 'p'), p)
    assert.equal(traversalForgiving, true)
    engine.configure({ FORGIVING: false })
    assert.equal(engine.down!(main, 'p'), p)
    assert.equal(traversalForgiving, false)
    assert.ok(hostCalls >= 3)
    engine.registerSelector(
      'legacyCustom',
      /^:legacyCustom(.*)/,
      (match, source) => ({
        match,
        status: true,
        source,
      }),
    )
    const beforeCustomQuery = hostCalls
    assert.deepEqual(
      adapter.querySelectorAll('p:legacyCustom', window.document),
      [p],
    )
    assert.equal(hostCalls, beforeCustomQuery + 1)
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'uninstall releases only the installed window’s native plans',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const cleared: number[] = []
    const windows = [new JSDOM('<p>A</p>').window, new JSDOM('<p>B</p>').window]
    try {
      const adapters = windows.map(
        window =>
          new DOMSelector(
            window as unknown as Window & typeof globalThis,
            window.document,
            {
              nativeQuery: {
                supportsHostSelector: (...args) =>
                  binding.supportsHostSelector(...args),
                queryHost: (...args) => binding.queryHost(...args),
                clearPlanCache(id) {
                  assert.equal(typeof id, 'number')
                  cleared.push(id!)
                  binding.clearPlanCache!(id)
                },
              },
            },
          ),
      )
      const [first, second] = adapters as [
        (typeof adapters)[number],
        (typeof adapters)[number],
      ]
      first.install()
      second.install()
      const lookup = (index: number) =>
        windows[index]!.document.querySelector('p')?.textContent
      assert.equal(lookup(0), 'A')
      assert.equal(lookup(1), 'B')
      first.uninstall()
      first.uninstall()
      assert.equal(cleared.length, 1)
      assert.equal(lookup(1), 'B')
      first.install()
      assert.equal(lookup(0), 'A')
      second.uninstall()
      assert.equal(cleared.length, 2)
      assert.notEqual(cleared[0], cleared[1])
      first.uninstall()
      assert.deepEqual(cleared, [cleared[0], cleared[1], cleared[0]])
    } finally {
      for (const window of windows) {
        window.close()
      }
    }
  },
)
