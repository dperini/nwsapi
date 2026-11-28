import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test('jsdom IDL support accepts wrappers and implementation nodes', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const idlUtils = require('jsdom/lib/generated/idl/utils.js') as {
    wrapperForImpl(node: unknown): Node
    implForWrapper?(node: Node): object | undefined
  }
  const { window } = new JSDOM('<!doctype html><main><p class=pick></p></main>')
  try {
    const document = window.document
    const main = document.querySelector('main')!
    const paragraph = document.querySelector('p')!
    const adapter = new DOMSelector(
      window as unknown as Window & typeof globalThis,
      document,
      {
        idlUtils,
      },
    )
    assert.equal(adapter.querySelector('.pick', document), paragraph)
    assert.equal(
      adapter.querySelector('.pick', idlUtils.implForWrapper!(main) as Element),
      paragraph,
    )
  } finally {
    window.close()
  }
})

test.skipIf(!addon)('Rust wrap preserves jsdom wrapper identity', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const utils = require('jsdom/lib/generated/idl/utils.js')
  const { window } = new JSDOM('<p></p>')
  try {
    let calls = 0
    const adapter = new DOMSelector(
      window as unknown as Window & typeof globalThis,
      window.document,
      {
        idlUtils: utils,
        nativeQuery: {
          ...binding,
          wrapHostNode(...args) {
            calls++
            return binding.wrapHostNode!(...args)
          },
        },
      },
    )
    const node = window.document.querySelector('p')!
    assert.equal(adapter.wrap(node), node)
    assert.equal(adapter.wrap(utils.implForWrapper(node)), node)
    assert.equal(adapter.wrap(null), undefined)
    assert.equal(adapter.wrap({}), undefined)
    assert.equal(calls, 5)
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'constructing from a jsdom implementation document shares the wrapper’s engine',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const utils = require('jsdom/lib/generated/idl/utils.js')
    const { window } = new JSDOM('<p id="target"></p>')
    try {
      const host = window as unknown as Window & typeof globalThis
      const document = window.document
      const impl = utils.implForWrapper(document)
      const inputs: unknown[] = []
      let queries = 0
      const nativeQuery: NativeQueryBinding = {
        ...binding,
        wrapHostNode(...args) {
          inputs.push(args[0])
          return binding.wrapHostNode!(...args)
        },
        queryHost(...args) {
          queries++
          return binding.queryHost(...args)
        },
      }
      const options = { idlUtils: utils, nativeQuery }
      const internal = new DOMSelector(host, impl, options)
      const external = new DOMSelector(host, document, options)
      assert.equal(inputs.length, 2)
      assert.equal(inputs[0], impl)
      assert.equal(inputs[1], document)
      assert.equal(internal.document, document)
      assert.equal(internal.engine, external.engine)
      const target = document.getElementById('target')
      assert.equal(internal.querySelector('#target', impl), target)
      assert.equal(external.querySelector('#target', document), target)
      assert.equal(queries, 2)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'installed matches honors plugin-written resolver entries until cleared',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM('<!doctype html><p></p>')
    try {
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args) {
              calls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      const p = window.document.getElementsByTagName('p')[0]!
      const engine = adapter.engine
      engine.match('p', p)
      const cache = engine.matchResolvers
      const plan = cache.get('false:p')
      assert.ok(plan)
      cache.set('false:aside', plan)
      adapter.install()
      assert.equal(p.matches('aside'), true)
      assert.equal(calls, 0)
      cache.clear()
      assert.equal(p.matches('aside'), false)
      assert.equal(calls, 1)
      engine.matchLambdas.set('selector:false:false:aside', () => true)
      assert.equal(p.matches('aside'), true)
      engine.matchLambdas.clear()
      assert.equal(p.matches('aside'), true)
      assert.equal(calls, 1)
      cache.clear()
      assert.equal(p.matches('aside'), false)
      assert.equal(calls, 2)
      adapter.uninstall()
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)('native jsdom queries unwrap implementation nodes', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const idlUtils = require('jsdom/lib/generated/idl/utils.js') as {
    wrapperForImpl(node: unknown): Node
    implForWrapper(node: Node): Node
  }
  const { window } = new JSDOM('<!doctype html><main><p class=pick></p></main>')
  try {
    const document = window.document
    const main = document.getElementsByTagName('main')[0]!
    const element = document.getElementsByTagName('p')[0]!
    let called = false
    const adapter = new DOMSelector(
      window as unknown as Window & typeof globalThis,
      idlUtils.implForWrapper(document) as Document,
      {
        idlUtils,
        nativeQuery: {
          supportsHostSelector: (...args) =>
            binding.supportsHostSelector(...args),
          queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
            called = true
            return binding.queryHost(...args)
          },
        },
      },
    )
    assert.equal(
      adapter.querySelector('.pick', idlUtils.implForWrapper(main)),
      element,
    )
    assert.equal(called, true)
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'native structural and attribute queries agree with v3',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><h2></h2><p id=target class=pick data-role=ENTRY><b></b></p>' +
        '<p class=pick data-role=other></p><p></p><a href="#one" role=button></a><input type=radio><input id=check type=checkbox required><select><option id=chosen></option><option></option></select><x-card></x-card><x-unknown></x-unknown></main>',
      { url: 'https://example.test/#target' },
    )
    try {
      const document = window.document
      window.customElements.define(
        'x-card',
        class extends window.HTMLElement {},
      )
      const host = window as unknown as Window & typeof globalThis
      let calls = 0
      const native = new DOMSelector(host, document, {
        nativeQuery: {
          supportsHostSelector: (...args) =>
            binding.supportsHostSelector(...args),
          queryHost(...args) {
            calls++
            return binding.queryHost(...args)
          },
        },
      })
      const original = new DOMSelector(host, document)
      const selectors = [
        '[data-role]',
        'a[href^="#"][role=button]',
        'input[type=RADIO i]',
        'input[type=RADIO]',
        'p[data-role="entry" i]',
        'p[data-role="ENTRY" s]',
        'h2:heading(2)',
        'p:nth-child(2)',
        'p:nth-of-type(2)',
        'p:nth-child(2 of .pick)',
        'main:has(> p[data-role=ENTRY] b)',
        'p:is([data-role=other], :last-child):not(:first-of-type)',
        'p:empty',
        ':target',
        'input:disabled',
        'input:enabled',
        'input:required',
        'input:optional',
        'p:read-only',
        'input:read-write',
        ':defined',
      ]
      const last = document.getElementsByTagName('p')[2]!
      ;(document.getElementById('check') as HTMLInputElement).checked = true
      const checked = document.getElementById('check')!
      const selected = document.getElementById('chosen')!
      for (const selector of ['input:checked', 'option:checked']) {
        assert.deepEqual(
          native.querySelectorAll(selector, document),
          original.querySelectorAll(selector, document),
          selector,
        )
      }
      assert.deepEqual(native.querySelectorAll('input:checked', document), [
        checked,
      ])
      assert.deepEqual(native.querySelectorAll('option:checked', document), [
        selected,
      ])
      const compare = () => {
        for (const selector of selectors) {
          assert.deepEqual(
            native.querySelectorAll(selector, document),
            original.querySelectorAll(selector, document),
            selector,
          )
        }
      }
      const main = document.getElementsByTagName('main')[0]!
      assert.deepEqual(
        native.querySelectorAll(':target', main),
        original.querySelectorAll(':target', main),
      )
      assert.deepEqual(native.querySelectorAll(':target', main), [
        document.getElementById('target'),
      ])
      compare()
      last.append(document.createTextNode(''))
      last.setAttribute('data-role', 'ENTRY')
      compare()
      assert.equal(calls, selectors.length * 2 + 6)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'installed DOM queries can use Rust and restore all prototypes',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p class=pick></p><p class=pick></p></main>',
    )
    try {
      const document = window.document
      const main = document.getElementsByTagName('main')[0]!
      const p = document.getElementsByTagName('p')[0]!
      const fragment = document.createDocumentFragment()
      const detached = document.createElement('p')
      detached.className = 'pick'
      fragment.append(detached)
      const prototypes = [
        window.Element.prototype,
        window.HTMLElement.prototype,
        window.Document.prototype,
        window.DocumentFragment.prototype,
      ]
      const names = ['closest', 'matches', 'querySelector', 'querySelectorAll']
      const descriptors = () =>
        prototypes.map(proto =>
          names.map(name => Object.getOwnPropertyDescriptor(proto, name)),
        )
      const original = descriptors()
      const cleared: number[] = []
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            clearPlanCache(id) {
              assert.equal(typeof id, 'number')
              cleared.push(id!)
              binding.clearPlanCache!(id)
            },
            supportsHostSelector: (...args) =>
              binding.supportsHostSelector(...args),
            queryHost(...args) {
              calls++
              return binding.queryHost(...args)
            },
          },
        },
      )

      adapter.install()
      adapter.install()
      assert.equal(document.querySelector('.pick'), p)
      assert.equal(main.querySelectorAll('.pick').item(0), p)
      assert.ok(p.matches('.pick'))
      assert.equal(p.closest('main'), main)
      assert.equal(fragment.querySelector('.pick'), detached)
      assert.equal(calls, 5)

      const visited: Element[] = []
      const queryWithCallback = main.querySelectorAll.bind(main) as unknown as (
        selector: string,
        callback: (node: Element) => boolean,
      ) => NodeListOf<Element>
      assert.equal(
        queryWithCallback('.pick', node => {
          visited.push(node)
          return false
        }).length,
        1,
      )
      assert.deepEqual(visited, [p])
      assert.equal(calls, 5)
      assert.equal(document.querySelector('p:not(:focus)'), p)
      assert.equal(calls, 6)

      adapter.uninstall()
      adapter.uninstall()
      assert.equal(cleared.length, 2)
      assert.equal(cleared[0], cleared[1])
      assert.deepEqual(descriptors(), original)
      assert.equal(document.querySelector('.pick'), p)
      assert.equal(calls, 6)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'installed Rust queries preserve static NodeList results when configured',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p class=pick></p></main>',
    )
    try {
      const document = window.document
      const p = document.querySelector('p')!
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            supportsHostSelector: (...args) =>
              binding.supportsHostSelector(...args),
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              calls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      adapter.engine.configure({ NODE_LIST: true })
      adapter.install()

      const result = document.querySelectorAll('.pick')
      assert.equal(result instanceof window.NodeList, true)
      assert.deepEqual(Array.from(result), [p])
      assert.equal(calls, 1)
      adapter.uninstall()
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'installed Rust queries honor duplicate-ID configuration by root type',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><i id=x></i><b id=x></b></main>',
    )
    try {
      const document = window.document
      const main = document.getElementsByTagName('main')[0]!
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            supportsHostSelector: (...args) =>
              binding.supportsHostSelector(...args),
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              calls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      adapter.install()
      adapter.engine.configure({ IDS_DUPES: false }, true)

      assert.deepEqual(
        Array.from(document.querySelectorAll('#x')).map(node => node.localName),
        ['i'],
      )
      assert.deepEqual(
        Array.from(main.querySelectorAll('#x')).map(node => node.localName),
        ['i', 'b'],
      )
      assert.equal(calls, 2)
      adapter.uninstall()
    } finally {
      window.close()
    }
  },
)
