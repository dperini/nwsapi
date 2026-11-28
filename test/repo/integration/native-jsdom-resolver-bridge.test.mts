import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

import { selectorUsesCustomResolver } from '../../../src/adapter/native/resolver.mts'

test.skipIf(!addon)(
  'duplicate-ID queries use Rust when duplicate IDs are disabled',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><i id="x"></i><b id="x"></b></main>',
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
      adapter.engine.configure({ IDS_DUPES: false })
      const document = window.document
      const main = document.querySelector('main')!

      assert.deepEqual(
        Array.from(adapter.querySelectorAll('#x', document)).map(
          node => node.localName,
        ),
        ['i'],
      )
      assert.deepEqual(
        Array.from(adapter.querySelectorAll('#x', main)).map(
          node => node.localName,
        ),
        ['i', 'b'],
      )
      assert.equal(hostCalls, 2)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'declarative operators and identity combinators use Rust',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p data-score="2" data-kind="primary"></p>' +
        '<p data-score="4" data-kind="secondary" data-tags="beta"></p>' +
        '<i data-tags=" alpha "></i><b></b><b data-missing="null"></b></main>',
    )
    try {
      let hostCalls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
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
      engine.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' })
      engine.registerOperator('@=', {
        p1: '(?:^)',
        p2: '(?:$)',
        p3: 'true',
      })
      engine.registerOperator('?=', { p1: 'prefix', p2: 'suffix', p3: 'false' })
      engine.registerCombinator('!', () => '')

      assert.equal(adapter.querySelectorAll('p', window.document).length, 2)
      assert.equal(hostCalls, 1)
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('p[data-score!="2"]', window.document),
          node => node.getAttribute('data-score'),
        ),
        ['4'],
      )
      assert.equal(hostCalls, 2)
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('p[data-score@="2"]', window.document),
          node => node.getAttribute('data-score'),
        ),
        ['2'],
      )
      assert.equal(hostCalls, 3)
      engine.registerOperator('%=', { p1: '^', p2: '', p3: 'false' })
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll(
            'p[data-score@="2"][data-kind%="secondary"]',
            window.document,
          ),
          node => node.getAttribute('data-kind'),
        ),
        ['primary'],
      )
      assert.equal(hostCalls, 4)
      engine.registerOperator('/=', { p1: '', p2: '$', p3: 'true' })
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('[data-kind/="condary"]', window.document),
          node => node.getAttribute('data-kind'),
        ),
        ['secondary'],
      )
      assert.equal(hostCalls, 5)
      engine.registerOperator('<=', { p1: '', p2: '', p3: 'true' })
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('[data-kind<="ond"]', window.document),
          node => node.getAttribute('data-kind'),
        ),
        ['secondary'],
      )
      assert.equal(hostCalls, 6)
      engine.registerOperator('>=', { p1: '^', p2: '(-|$)', p3: 'true' })
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('[data-kind>="primary"]', window.document),
          node => node.getAttribute('data-kind'),
        ),
        ['primary'],
      )
      assert.equal(hostCalls, 7)
      engine.registerOperator('&=', {
        p1: '(^|[\\t\\n\\f\\r ])',
        p2: '([\\t\\n\\f\\r ]|$)',
        p3: 'true',
      })
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('[data-tags&=""]', window.document),
          node => node.localName,
        ),
        ['i'],
      )
      assert.equal(hostCalls, 8)
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('[data-missing^="n"]', window.document),
          node => node.localName,
        ),
        ['html', 'head', 'body', 'main', 'p', 'p', 'i', 'b', 'b'],
      )
      assert.equal(hostCalls, 9)
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('[data-missing~="null"]', window.document),
          node => node.getAttribute('data-missing'),
        ),
        ['null'],
      )
      assert.equal(hostCalls, 10)
      assert.deepEqual(
        adapter.querySelectorAll('p/* ! ?= */', window.document),
        adapter.engine.select('p', window.document),
      )
      assert.equal(hostCalls, 11)
      assert.deepEqual(
        Array.from(
          adapter.querySelectorAll('p!p', window.document),
          node => node.localName,
        ),
        ['p', 'p'],
      )
      assert.equal(hostCalls, 12)
      let callbackCalls = 0
      engine.Combinators['!'] = () => {
        callbackCalls++
        return ''
      }
      engine.configure({}, true)
      assert.equal(adapter.querySelectorAll('p!p', window.document).length, 2)
      assert.ok(callbackCalls > 0)
      assert.equal(hostCalls, 12)
      engine.Combinators['!'] = () => ''
      engine.configure({}, true)
      assert.equal(adapter.querySelectorAll('p!p', window.document).length, 2)
      assert.equal(hostCalls, 13)
      const first = window.document.getElementsByTagName('p')[0]!
      assert.equal(adapter.matches('p!i', first), true)
      assert.equal(adapter.closest('p!i', first), first)
      assert.equal(adapter.querySelectorAll('p!i', window.document).length, 0)
      assert.equal(adapter.querySelectorAll('p!i!p', window.document).length, 2)
      assert.equal(hostCalls, 13)
      assert.equal(adapter.querySelectorAll('p!p!p', window.document).length, 2)
      assert.equal(hostCalls, 14)
    } finally {
      window.close()
    }
  },
)
test.skipIf(!addon)(
  'custom resolver text in attribute values keeps native queries enabled',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p title=":custom"></p></main>',
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
      adapter.engine.registerSelector(
        'custom',
        /^:custom(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      assert.equal(
        adapter.querySelectorAll('[title=":custom"]', window.document).length,
        1,
      )
      assert.equal(hostCalls, 1)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'negative declarative operator aliases keep Rust resolver semantics',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p id="alpha" data-value="alpha-beta" data-tags="alpha beta"></p>' +
        '<p id="beta" data-value="beta-gamma" data-tags="beta gamma"></p></main>',
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
      const engine = adapter.engine
      engine.registerOperator('%=', { p1: '^', p2: '', p3: 'false' })
      engine.registerOperator('/=', { p1: '', p2: '$', p3: 'false' })
      engine.registerOperator('<=', { p1: '', p2: '', p3: 'false' })
      engine.registerOperator('>=', {
        p1: '^',
        p2: '(-|$)',
        p3: 'false',
      })
      engine.registerOperator('&=', {
        p1: '(^|[\\t\\n\\f\\r ])',
        p2: '([\\t\\n\\f\\r ]|$)',
        p3: 'false',
      })
      const selectors = [
        '[data-value%="alpha"]',
        '[data-value/="beta"]',
        '[data-value<="alpha"]',
        '[data-value>="alpha"]',
        '[data-tags&="alpha"]',
      ]
      for (const selector of selectors) {
        const expected = engine.select(selector, window.document)
        const before: number = hostCalls
        assert.deepEqual(
          adapter.querySelectorAll(selector, window.document),
          expected,
          selector,
        )
        assert.equal(
          hostCalls,
          before + 1,
          selector + ' should execute in Rust',
        )
      }
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'wildcard namespace attribute operators do not treat absent attributes as null',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM('<!doctype html><main><p></p></main>')
    try {
      const element = window.document.querySelector('p')!
      element.setAttributeNS('urn:test', 'x:data-missing', 'present')
      element.setAttributeNS('urn:test', 'x:data-case', 'MiXeD')
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, window.document, {
        nativeQuery: binding,
      })
      const reference = new DOMSelector(host, window.document)
      for (const selector of [
        '[*|data-missing^="n"]',
        '[*|data-missing$="l"]',
        '[*|data-missing*="ull"]',
        '[*|data-case="mixed"]',
        '[*|data-case="MiXeD"]',
      ]) {
        assert.deepEqual(
          native.querySelectorAll(selector, window.document),
          reference.querySelectorAll(selector, window.document),
        )
        assert.deepEqual(
          native.querySelectorAll(selector, window.document),
          selector.endsWith('="MiXeD"]') ? [element] : [],
        )
      }
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'missing host attributes keep implicit HTML case-insensitive matching',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p></p><p type="null"></p></main>',
    )
    try {
      let hostCalls = 0
      const host = window as unknown as Window & typeof globalThis
      const native = new DOMSelector(host, window.document, {
        nativeQuery: {
          ...binding,
          queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
            hostCalls++
            return binding.queryHost(...args)
          },
        },
      })
      const reference = new DOMSelector(host, window.document)
      for (const selector of [
        '[type^="N"]',
        '[type$="L"]',
        '[type*="UL"]',
        '[type|="NULL"]',
      ]) {
        assert.deepEqual(
          native.querySelectorAll(selector, window.document),
          reference.querySelectorAll(selector, window.document),
          selector,
        )
      }
      assert.equal(hostCalls, 4)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'functional host states are captured before Rust query evaluation',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p id="current"></p></main>',
    )
    try {
      const document = window.document
      const paragraph = document.getElementById('current')!
      let hostStateCalls = 0
      let rustQueries = 0
      const native = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            ...binding,
            selectorStates(element, selector) {
              hostStateCalls++
              return element === paragraph && selector === ':current(.chapter)'
                ? ['functional::current(.chapter)']
                : []
            },
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              rustQueries++
              return binding.queryHost(...args)
            },
          },
        },
      )
      assert.deepEqual(
        native.querySelectorAll(':current(.chapter)', document),
        [paragraph],
      )
      assert.ok(hostStateCalls > 0)
      assert.equal(rustQueries, 1)
    } finally {
      window.close()
    }
  },
)

test('resolver routing preserves plugin regex state and recognizes unanchored matches', () => {
  const sticky = /ick/y
  sticky.lastIndex = 2
  for (const expression of [sticky, /ick/g, /ick/]) {
    const engine = {
      Selectors: { custom: { Expression: expression } },
      Operators: {},
      CFG: { combinators: '[>+~]' },
    }
    const originalIndex = expression.lastIndex
    assert.equal(selectorUsesCustomResolver(engine, ':pick'), true)
    assert.equal(selectorUsesCustomResolver(engine, 'aside'), false)
    assert.equal(expression.lastIndex, originalIndex)
  }
})
