// max-file-lines: cases — Keeps jsdom bridge contract cases in one test fixture.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import { queryNativeHost } from '../../../src/adapter/native-query.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'host plan cache distinguishes identity combinators from unregistered syntax',
  () => {
    const binding = require(addon!) as NativeQueryBinding
    const selector = Uint16Array.from([112, 33, 112])
    const rows = [
      { document: true },
      { parent: 0, tag: 'p' },
      { parent: 0, tag: 'i' },
    ]
    const query = (extension?: string) =>
      binding.queryHost(
        'select',
        selector,
        rows,
        0,
        false,
        true,
        true,
        true,
        16,
        8192,
        'jsdom',
        false,
        extension,
        0,
      )
    assert.equal(query(), null)
    assert.deepEqual(Array.from(query('!CI')!), [1])
    assert.equal(query(), null)
  },
)

test.skipIf(!addon)(
  'traversal plugin routes selector and index walks through the Rust host bridge',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><section><i id=a data-score="2"></i> text <!-- gap --><b id=b></b><i id=c data-score="3"></i></section></main>',
    )
    try {
      let hostCalls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            supportsHostSelector: (...args) =>
              binding.supportsHostSelector(...args),
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              hostCalls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      const engine = adapter.engine
      const file = require.resolve('../../../dist/modules/nwsapi-traversal.js')
      runInNewContext(readFileSync(file, 'utf8'), {
        NW: { Dom: engine },
        document: window.document,
      })
      const a = window.document.getElementById('a')!
      const b = window.document.getElementById('b')!
      const c = window.document.getElementById('c')!
      const main = window.document.getElementsByTagName('main')[0]!
      const section = window.document.getElementsByTagName('section')[0]!
      assert.equal(engine.next!(a), b)
      assert.equal(engine.next!(a, 1), c)
      assert.equal(engine.next!(a, 'i'), c)
      assert.equal(engine.previous!(c), b)
      assert.equal(engine.up!(a, 'main'), main)
      assert.equal(engine.down!(main), section)
      assert.equal(engine.down!(main, 0), main)
      assert.equal(engine.down!(main, 'b'), b)
      const compareTraversal = (label: string, query: () => Element | null) => {
        const nativeResult = query()
        const native = engine.nativeTraversal?.bind(engine)
        delete engine.nativeTraversal
        let fallbackResult: Element | null
        try {
          fallbackResult = query()
        } finally {
          if (native) {
            engine.nativeTraversal = native
          }
        }
        assert.equal(nativeResult, fallbackResult!, label)
      }
      for (const [label, query] of [
        ['up nearest index', () => engine.up!(a, 0)],
        ['up outer index', () => engine.up!(a, 1)],
        ['up out of range', () => engine.up!(a, 2)],
        ['up scope selector', () => engine.up!(a, ':scope')],
        ['next nearest index', () => engine.next!(a, 0)],
        ['next matching selector', () => engine.next!(a, 'b')],
        ['next scope selector', () => engine.next!(a, ':scope')],
        ['previous negative index', () => engine.previous!(c, -1)],
        ['previous fractional index', () => engine.previous!(c, 0.5)],
        ['down starting index', () => engine.down!(main, 0)],
        ['down first descendant', () => engine.down!(main, 1)],
        ['down nested descendant', () => engine.down!(main, 2)],
        ['down scope selector', () => engine.down!(main, ':scope')],
      ] as const) {
        compareTraversal(label, query)
      }
      const detached = window.document.createElement('article')
      const detachedParent = window.document.createElement('div')
      const detachedChild = window.document.createElement('span')
      detached.append(detachedParent)
      detachedParent.append(detachedChild)
      compareTraversal('detached ancestor', () => engine.up!(detachedChild, 0))
      compareTraversal('detached down', () => engine.down!(detached, 'span'))

      const fragment = window.document.createDocumentFragment()
      const fragmentSection = window.document.createElement('section')
      fragmentSection.innerHTML = '<i></i><b id=fragment-target></b>'
      fragment.append(fragmentSection)
      assert.equal(engine.down!(fragment), fragmentSection)
      assert.equal(engine.down!(fragment, 0), fragment)
      assert.equal(engine.down!(fragment, 1), fragmentSection)
      assert.equal(engine.down!(fragment, 'b'), fragment.querySelector('b'))
      assert.ok(hostCalls >= 17)
      engine.registerSelector(
        'nativeFallback',
        /^::nativeFallback(.*)/,
        (match, source) => ({
          match,
          status: true,
          source: `if(e.localName==="i"&&e.id!=="never"){${source}}`,
        }),
      )
      engine.registerSelector('customTag', /^i$/, (match, source) => ({
        match,
        status: true,
        source: `if(false){${source}}`,
      }))
      const beforeCustomSelector = hostCalls
      assert.deepEqual(adapter.querySelectorAll('i', window.document), [a, c])
      assert.equal(hostCalls, beforeCustomSelector)
      const beforeFallback = hostCalls
      assert.equal(
        engine.down!(main, 'i::nativeFallback'),
        window.document.getElementById('a'),
      )
      assert.equal(hostCalls, beforeFallback)
      engine.registerCombinator('!', () => '')
      engine.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' })
      const beforeCustomResolvers = hostCalls
      assert.deepEqual(adapter.querySelectorAll('i', window.document), [a, c])
      assert.equal(hostCalls, beforeCustomResolvers)
      assert.deepEqual(adapter.querySelectorAll('main', window.document), [
        main,
      ])
      assert.equal(hostCalls, beforeCustomResolvers + 1)
      const beforeResolvers = hostCalls
      assert.deepEqual(adapter.querySelectorAll('i!i', window.document), [a, c])
      assert.deepEqual(
        adapter.querySelectorAll('i[data-score!="2"]', window.document),
        [c],
      )
      assert.equal(hostCalls, beforeResolvers + 1)
      const legacyFile =
        require.resolve('../../../dist/modules/nwsapi-legacy.js')
      runInNewContext(readFileSync(legacyFile, 'utf8'), {
        NW: { Dom: engine },
        document: window.document,
      })
      engine.configure({ LEGACY: true })
      const beforeLegacy = hostCalls
      assert.equal(engine.down!(main, 'b'), b)
      assert.equal(hostCalls, beforeLegacy + 1)
      engine.install()
      const beforeLegacyInstall = hostCalls
      assert.deepEqual(Array.from(window.document.querySelectorAll('b')), [b])
      assert.equal(hostCalls, beforeLegacyInstall)
      engine.uninstall()
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'Node bridge keeps the jQuery selector plugin opt-in',
  () => {
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p id=a></p><p id=b></p><p id=c></p></main>',
    )
    try {
      const document = window.document
      assert.equal(
        queryNativeHost(binding, document, 'select', 'p:even', document),
        undefined,
      )
      const matches = queryNativeHost(
        { ...binding, jquery: true },
        document,
        'select',
        'p:even',
        document,
      )
      assert.deepEqual(
        matches?.map(element => element.id),
        ['a', 'c'],
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)('raw bridge snapshots jQuery visibility dimensions', () => {
  const binding = require(addon!) as NativeQueryBinding
  const { window } = new JSDOM(
    '<!doctype html><style>.shown { display: block }</style>' +
      '<main><p class=shown></p><p class=hidden></p></main>',
  )
  try {
    const document = window.document
    const enabled = { ...binding, jquery: true }
    assert.deepEqual(
      queryNativeHost(enabled, document, 'select', 'p:visible', document),
      [],
    )
    assert.deepEqual(
      queryNativeHost(enabled, document, 'select', 'p:hidden', document)?.map(
        p => p.tagName,
      ),
      ['P', 'P'],
    )
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'form-associated custom elements keep validity checks on the host engine',
  () => {
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<form><x-control><div id=scope><span></span></div></x-control></form>',
    )
    try {
      class FormAssociatedControl extends window.HTMLElement {
        static formAssociated = true
      }
      window.customElements.define('x-control', FormAssociatedControl)
      const document = window.document
      assert.equal(
        binding.supportsHostSelector(
          Uint16Array.from('x-control:valid', character =>
            character.charCodeAt(0),
          ),
        ),
        true,
      )
      assert.equal(
        queryNativeHost(
          binding,
          document,
          'select',
          'x-control:valid',
          document,
        ),
        undefined,
      )
      const control = document.querySelector('x-control')!
      const shadow = control.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<span></span>'
      assert.equal(
        queryNativeHost(
          binding,
          document,
          'select',
          ':host-context(x-control:valid) > span',
          shadow,
        ),
        undefined,
      )
      assert.equal(
        queryNativeHost(
          binding,
          document,
          'select',
          'x-control:valid div span',
          document.getElementById('scope')!,
        ),
        undefined,
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native jQuery :parent includes text and comment child nodes',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const extensionFile =
      require.resolve('../../../dist/modules/nwsapi-jquery.js')
    const html =
      '<!doctype html><main><template id=template><b>inert</b></template>' +
      '<p id=text> </p><p id=comment><!-- child --></p><p id=empty></p></main>'
    const { window } = new JSDOM(html)
    try {
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, window.document, {
        nativeQuery: { ...binding, jquery: true },
      })
      const fallback = new DOMSelector(host, window.document)
      for (const engine of [native.engine, fallback.engine]) {
        runInNewContext(readFileSync(extensionFile, 'utf8'), {
          NW: { Dom: engine },
        })
      }
      const expected = [
        window.document.getElementById('text'),
        window.document.getElementById('comment'),
      ]
      assert.deepEqual(
        native.querySelectorAll('p:parent', window.document),
        expected,
      )
      assert.deepEqual(
        fallback.querySelectorAll('p:parent', window.document),
        expected,
      )
      assert.deepEqual(
        native.querySelectorAll('template:parent', window.document),
        [],
      )
      assert.deepEqual(
        fallback.querySelectorAll('template:parent', window.document),
        [],
      )
    } finally {
      window.close()
    }
  },
)
