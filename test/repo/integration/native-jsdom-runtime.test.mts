import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'native stylesheet matching resolves assigned slot selectors',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><x-host><p slot=content class=assigned></p></x-host>',
    )
    try {
      const document = window.document
      const host = document.querySelector('x-host')!
      const assigned = document.querySelector('p')!
      host.attachShadow({ mode: 'open' }).innerHTML =
        '<slot name=content></slot>'
      assert.equal(assigned.assignedSlot?.localName, 'slot')

      const native = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        { nativeQuery: binding },
      )
      const fallback = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
      )
      assert.equal(
        native.check('slot[name=content]::slotted(.assigned)', assigned).match,
        fallback.check('slot[name=content]::slotted(.assigned)', assigned)
          .match,
      )
      assert.equal(
        native.check('slot[name=content]::slotted(.missing)', assigned).match,
        false,
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)('native scope and document roots agree with v3', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const { window } = new JSDOM(
    '<!doctype html><main class=scope><p class=pick></p><section><p class=pick></p></section></main>',
  )
  try {
    const doc = window.document
    const host = window as unknown as Window & typeof globalThis
    let calls = 0
    const native = new DOMSelector(host, doc, {
      nativeQuery: {
        supportsHostSelector: (...args) =>
          binding.supportsHostSelector(...args),
        queryHost(...args) {
          calls++
          return binding.queryHost(...args)
        },
      },
    })
    const fallback = new DOMSelector(host, doc)
    const main = doc.getElementsByTagName('main')[0]!
    const p = main.getElementsByTagName('p')[0]!
    const fragment = doc.createDocumentFragment()
    const detached = doc.createElement('p')
    detached.className = 'pick'
    fragment.append(detached)
    const checks = [
      [':root', doc],
      [':scope > body main', doc],
      [':scope > .pick', main],
      [':is(:scope) > .pick', main],
      [':root .pick', main],
      [':root, :scope > p', fragment],
      ['.pick:not(:scope)', fragment],
      [':root, :scope > p', detached],
    ] as const
    for (const [selector, context] of checks) {
      assert.deepEqual(
        native.querySelectorAll(selector, context),
        fallback.querySelectorAll(selector, context),
        selector,
      )
    }
    assert.equal(
      native.querySelector(':scope', main),
      fallback.querySelector(':scope', main),
    )
    assert.equal(native.querySelector(':scope', main), null)
    assert.deepEqual(
      native.querySelectorAll(':scope', main),
      fallback.querySelectorAll(':scope', main),
    )
    assert.deepEqual(native.querySelectorAll(':scope', main), [])
    assert.equal(native.closest(':scope', p), fallback.closest(':scope', p))
    assert.equal(native.closest(':scope', p), p)
    assert.equal(
      native.matches(':scope.pick', p),
      fallback.matches(':scope.pick', p),
    )
    assert.equal(native.closest(':root', p), fallback.closest(':root', p))
    assert.equal(calls, checks.length + 8)
    assert.equal(
      native.querySelector('main:has(:scope > p)', doc),
      fallback.querySelector('main:has(:scope > p)', doc),
    )
    assert.equal(calls, checks.length + 8)
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'native focus states track focus transitions like v3',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><button id=focusable>Focus</button></main>',
    )
    try {
      const document = window.document
      document.hasFocus = () => true
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, document, { nativeQuery: binding })
      const fallback = new DOMSelector(host, document)
      const button = document.getElementById('focusable')!
      const selectors = [':focus', ':focus-visible', ':focus-within', ':active']
      const compare = () => {
        for (const selector of selectors) {
          assert.deepEqual(
            native.querySelectorAll(selector, document),
            fallback.querySelectorAll(selector, document),
            selector,
          )
        }
      }

      compare()
      button.focus()
      compare()
      button.blur()
      compare()
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native language matching sees inherited and XML language declarations',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main lang=en-US><p id=a></p><p id=b></p><div id=host></div></main>',
    )
    try {
      const doc = window.document
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, doc, { nativeQuery: binding })
      const fallback = new DOMSelector(host, doc)
      const b = doc.getElementById('b')!
      const xml = 'http://www.w3.org/XML/1998/namespace'
      b.setAttributeNS(xml, 'xml:lang', 'zh-Hant-TW')
      const selectors = ['p:lang(en)', 'p:lang("zh-*-tw")', 'p:not(:lang(en))']
      for (const selector of selectors) {
        assert.equal(
          binding.supportsHostSelector(
            Uint16Array.from(selector, c => c.charCodeAt(0)),
          ),
          true,
        )
        assert.deepEqual(
          native.querySelectorAll(selector, doc),
          fallback.querySelectorAll(selector, doc),
          selector,
        )
      }
      b.removeAttributeNS(xml, 'lang')
      assert.deepEqual(
        native.querySelectorAll('p:lang(en)', doc),
        fallback.querySelectorAll('p:lang(en)', doc),
      )

      const shadow = doc.getElementById('host')!.attachShadow({ mode: 'open' })
      const child = doc.createElement('span')
      shadow.append(child)
      assert.equal(native.querySelector('span:lang(en)', shadow), child)
      b.setAttributeNS('urn:example', 'role', 'button')
      assert.deepEqual(
        native.querySelectorAll('[role=button]', doc),
        fallback.querySelectorAll('[role=button]', doc),
      )
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native shadow-root host and slot queries agree with v3',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><body><main><x-host class=host><i slot=content class=assigned></i></x-host></main></body>',
    )
    try {
      const document = window.document
      const host = document.querySelector('x-host')!
      const shadow = host.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<slot name=content></slot><b class=internal></b>'
      const native = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        { nativeQuery: binding },
      )
      const fallback = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
      )
      const cases = [
        [':host', []],
        [':host > slot', [shadow.querySelector('slot')]],
        [':host(.host) > slot', [shadow.querySelector('slot')]],
        [':host-context(body) > slot', [shadow.querySelector('slot')]],
        ['slot:has-slotted(.assigned)', [shadow.querySelector('slot')]],
        ['.internal', [shadow.querySelector('.internal')]],
      ] as const
      for (const [selector, expected] of cases) {
        assert.deepEqual(native.querySelectorAll(selector, shadow), expected)
        assert.deepEqual(
          native.querySelectorAll(selector, shadow),
          fallback.querySelectorAll(selector, shadow),
          selector,
        )
      }
      assert.deepEqual(native.querySelectorAll('.internal', document), [])
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native and JavaScript :default choose the first form submitter',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><form><button id=first>go</button><input id=image type=image></form>',
    )
    try {
      const doc = window.document
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, doc, { nativeQuery: binding })
      const fallback = new DOMSelector(host, doc)
      const expected = [doc.getElementById('first')]
      assert.deepEqual(native.querySelectorAll(':default', doc), expected)
      assert.deepEqual(fallback.querySelectorAll(':default', doc), expected)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native disabled state honors the disabled fieldset first legend',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><fieldset disabled><legend><input id=first-legend></legend>' +
        '<legend><input id=second-legend></legend><div><input id=nested></div></fieldset>',
    )
    try {
      const doc = window.document
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, doc, { nativeQuery: binding })
      const fallback = new DOMSelector(host, doc)
      const firstLegend = doc.getElementById('first-legend')!
      const disabled = [
        doc.querySelector('fieldset')!,
        doc.getElementById('second-legend')!,
        doc.getElementById('nested')!,
      ]

      assert.deepEqual(native.querySelectorAll(':disabled', doc), disabled)
      assert.deepEqual(
        native.querySelectorAll(':disabled', doc),
        fallback.querySelectorAll(':disabled', doc),
      )
      assert.deepEqual(native.querySelectorAll(':enabled', doc), [firstLegend])
      assert.deepEqual(
        native.querySelectorAll(':enabled', doc),
        fallback.querySelectorAll(':enabled', doc),
      )

      const fieldset = doc.querySelector('fieldset') as HTMLFieldSetElement
      fieldset.disabled = false
      assert.deepEqual(native.querySelectorAll(':disabled', doc), [])
      fieldset.disabled = true
      assert.deepEqual(native.querySelectorAll(':disabled', doc), disabled)
    } finally {
      window.close()
    }
  },
)
