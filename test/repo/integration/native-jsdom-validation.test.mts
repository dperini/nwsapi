import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'native and JavaScript validation states ignore validation-suppression flags',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><form id=form novalidate><input id=bad required>' +
        '<input id=disabled required disabled><button id=submit formnovalidate>go</button></form>' +
        '<input id=externalBad form=form required>',
    )
    try {
      const document = window.document
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, document, { nativeQuery: binding })
      const fallback = new DOMSelector(host, document)
      let invalidEvents = 0
      document
        .getElementById('bad')!
        .addEventListener('invalid', () => invalidEvents++)
      const cases = [
        ['form:invalid', ['form']],
        ['input:invalid', ['bad', 'externalBad']],
        ['button:valid', ['submit']],
        ['#disabled:valid, #disabled:invalid', []],
      ] as const
      for (const [selector, ids] of cases) {
        const expected = ids.map(id => document.getElementById(id))
        assert.deepEqual(native.querySelectorAll(selector, document), expected)
        assert.deepEqual(
          native.querySelectorAll(selector, document),
          fallback.querySelectorAll(selector, document),
        )
      }
      assert.equal(invalidEvents, 0)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native and JavaScript required states follow HTML control applicability',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><input id=hidden type=hidden required>' +
        '<input id=range type=range required><input id=color type=color required>' +
        '<input id=submit type=submit required><button id=button required></button>' +
        '<svg><input id=svg required></input></svg><input id=text required>' +
        '<select id=select required></select><textarea id=textarea required></textarea>',
    )
    try {
      const document = window.document
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, document, { nativeQuery: binding })
      const fallback = new DOMSelector(host, document)
      const cases = [
        [':required', ['text', 'select', 'textarea']],
        [':optional', ['hidden', 'range', 'color', 'submit', 'button']],
        ['svg :required, svg :optional', []],
      ] as const
      for (const [selector, ids] of cases) {
        const expected = ids.map(id => document.getElementById(id))
        assert.deepEqual(native.querySelectorAll(selector, document), expected)
        assert.deepEqual(
          fallback.querySelectorAll(selector, document),
          expected,
        )
      }
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native mixed-namespace selectors agree with v3 in HTML documents',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><svg viewBox="0 0 1 1"><linearGradient id=gradient class=target></linearGradient><use xlink:href="#gradient"></use></svg>' +
        '<math><mi class=target>x</mi></math></main>',
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
      const gradient = doc.getElementsByTagName('linearGradient')[0]!
      const widget = doc.createElementNS(null, 'widget')
      const qualified = doc.createElementNS('urn:example', 'example:widget')
      qualified.className = 'target'
      main.append(widget, qualified)
      const selectors = [
        'svg > lineargradient',
        '*|linearGradient',
        'svg[viewBox]',
        'use[*|HREF="#gradient"]',
        'use[|href]',
        'use[href]',
        'math > mi',
        '|widget',
        '*|widget',
        '.target',
        ':scope > svg:first-of-type',
        'main:has(> math mi)',
      ]
      for (const selector of selectors) {
        assert.deepEqual(
          native.querySelectorAll(selector, main),
          fallback.querySelectorAll(selector, main),
          selector,
        )
      }
      assert.equal(
        native.matches('svg > lineargradient', gradient),
        fallback.matches('svg > lineargradient', gradient),
      )
      assert.equal(
        native.closest('*|svg', gradient),
        fallback.closest('*|svg', gradient),
      )
      assert.equal(calls, selectors.length + 2)
      assert.deepEqual(native.querySelectorAll('|widget', main), [widget])
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'native XML selectors preserve name case and namespace identity',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<Root xmlns:x="urn:example"><Item ID="upper" class="pick" Role="button"/>' +
        '<item id="lower" class="pick" role="button"/><x:Item id="foreign"/>' +
        '<html:Item xmlns:html="http://www.w3.org/1999/xhtml" Role="button"/></Root>',
      { contentType: 'application/xml' },
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
      const selectors = [
        'Item',
        'item',
        'ITEM',
        'Root > :is(Item, item)',
        '*|Item',
        '|Item',
        '[Role]',
        '[role]',
        '[Role=button]',
        '.pick',
        ':root',
        ':scope > Item',
        'Item:first-of-type',
        'Root:has(> Item[Role])',
      ]
      for (const selector of selectors) {
        assert.deepEqual(
          native.querySelectorAll(selector, doc),
          fallback.querySelectorAll(selector, doc),
          selector,
        )
      }
      const upper = doc.getElementsByTagName('Item')[0]!
      assert.equal(
        native.matches('Item[Role]', upper),
        fallback.matches('Item[Role]', upper),
      )
      assert.equal(
        native.closest('Root', upper),
        fallback.closest('Root', upper),
      )
      assert.equal(calls, selectors.length + 2)

      const fragment = doc.createDocumentFragment()
      const detached = doc.createElement('Detached')
      fragment.append(detached)
      assert.equal(native.querySelector('Detached', fragment), detached)
      assert.equal(native.querySelector('detached', fragment), null)
    } finally {
      window.close()
    }
  },
)
