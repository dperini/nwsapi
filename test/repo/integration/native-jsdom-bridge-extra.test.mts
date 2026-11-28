import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { nativeCustomOperatorForSelector } from '../../../src/adapter/native/resolver.mts'
import type { DOMSelectorAdapter } from '../../../src/adapter/dom-selector.mts'
import type { NativeQueryBinding } from '../../../src/adapter/native-query.mts'

const require = createRequire(import.meta.url)
const addon = process.env['NWSAPI_NODE_ADDON']

test.skipIf(!addon)(
  'generated localName predicates preserve SVG case in Rust',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><lineargradient></lineargradient><svg><linearGradient/></svg>',
    )
    try {
      const document = window.document
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
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
      adapter.engine.registerSelector(
        'svg:gradient',
        /^:paint(.*)/,
        (match, source) => ({
          match,
          status: true,
          source: `if(e.localName==="linearGradient"){${source}}`,
        }),
      )
      const matches = adapter.querySelectorAll(':paint', document)
      assert.deepEqual(matches, adapter.engine.select(':paint', document))
      assert.deepEqual(
        Array.from(matches, element => element.localName),
        ['linearGradient'],
      )
      adapter.engine.registerSelector(
        'svg:gradientFilter',
        /^::gradientFilter(.*)/,
        (match, source) => ({
          match,
          status: true,
          source: `if(e.localName==="linearGradient"){${source}}`,
        }),
      )
      for (const selector of [
        '::gradientFilter',
        'linearGradient::gradientFilter',
      ]) {
        assert.deepEqual(
          adapter.querySelectorAll(selector, document),
          adapter.engine.select(selector, document),
        )
      }
      const svg = document.querySelector('svg')!
      const unicodeElement = document.createElementNS(
        svg.namespaceURI,
        'élément',
      )
      svg.appendChild(unicodeElement)
      adapter.engine.configure({}, true)
      adapter.engine.registerSelector(
        'svg:unicode',
        /^:unicodePaint(.*)/,
        (match, source) => ({
          match,
          status: true,
          source: `if(e.localName==="élément"){${source}}`,
        }),
      )
      assert.equal(
        nativeCustomOperatorForSelector(adapter.engine, ':unicodePaint'),
        ':LunicodePaint:élément;',
      )
      const unicodeMatch = adapter.querySelector(':unicodePaint', document)
      assert.equal(unicodeMatch, unicodeElement)
      assert.equal(
        unicodeMatch,
        adapter.engine.first(':unicodePaint', document),
      )
      assert.equal(calls, 4)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)('block localName predicates translate to Rust', () => {
  const DOMSelector =
    require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
  const binding = require(addon!) as NativeQueryBinding
  const { window } = new JSDOM(
    "<svg xmlns='http://www.w3.org/2000/svg'><linearGradient/></svg>",
  )
  try {
    let calls = 0
    const adapter = new DOMSelector(
      window as unknown as Window & typeof globalThis,
      window.document,
      {
        nativeQuery: {
          ...binding,
          queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
            calls++
            return binding.queryHost(...args)
          },
        },
      },
    )
    const engine = adapter.engine
    engine.registerSelector('svg:gradient', /^:paint(.*)/, (match, source) => {
      return {
        match,
        status: true,
        source: `if(e.localName==="linearGradient"){${source}}`,
      }
    })
    const gradient = window.document.querySelector('linearGradient')!
    assert.equal(adapter.querySelector(':paint', window.document), gradient)
    assert.equal(calls, 1)

    engine.Selectors['svg:gradient']!.Callback = function (match, source) {
      return {
        match,
        status: true,
        source: `if(e.localName==="linearGradient"){${source}}`,
      }
    }
    engine.configure({}, true)
    assert.equal(adapter.querySelector(':paint', window.document), gradient)
    assert.equal(calls, 2)
  } finally {
    window.close()
  }
})

test.skipIf(!addon)(
  'registered pass-through pseudo follows its writable callback',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM(
      '<!doctype html><main><p class="pick"></p><i></i></main>',
    )
    try {
      const document = window.document
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
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
      const engine = adapter.engine
      engine.registerSelector(
        'plugin:key',
        /^:chosen(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      const chosen = document.getElementsByTagName('p')[0]!
      assert.equal(adapter.querySelector('p:chosen', document), chosen)
      assert.equal(calls, 1)
      const entry = engine.Selectors['plugin:key']!
      const original = entry.Callback
      entry.Callback = (match, source) => ({
        match,
        status: true,
        source: `if(false){${source}}`,
      })
      engine.configure({}, true)
      assert.equal(adapter.querySelector('p:chosen', document), null)
      assert.equal(calls, 2)
      entry.Callback = original
      engine.configure({}, true)
      assert.equal(adapter.querySelector('p:chosen', document), chosen)
      assert.equal(calls, 3)
      entry.Expression = /^:ChOsEn(.*)/i
      engine.configure({}, true)
      for (const selector of ['p:CHOSEN', 'p:chosen', 'p:Chosen']) {
        assert.equal(
          adapter.querySelector(selector, document),
          engine.first(selector, document),
        )
      }
      assert.equal(calls, 6)
      entry.Expression = /^:ChOsEn(.*)/
      engine.configure({}, true)
      assert.throws(() => adapter.querySelector('p:chosen', document), {
        name: 'SyntaxError',
      })
      assert.equal(adapter.querySelector('p:ChOsEn', document), chosen)
      const beforeBare = calls
      for (const selector of [':ChOsEn', '*:ChOsEn']) {
        assert.deepEqual(
          adapter.querySelectorAll(selector, document),
          engine.select(selector, document),
        )
      }
      assert.equal(calls, beforeBare + 2)
      for (const selector of [
        'p.pick:ChOsEn',
        'main > p:ChOsEn',
        ':is(p:ChOsEn)',
      ]) {
        assert.deepEqual(
          adapter.querySelectorAll(selector, document),
          engine.select(selector, document),
        )
      }
      assert.equal(calls, beforeBare + 5)
      engine.configure({}, true)
      engine.registerSelector(
        'plugin:second',
        /^:second(.*)/,
        (match, source) => ({
          match,
          status: true,
          source,
        }),
      )
      const beforeMultiple = calls
      const multiple = 'p:ChOsEn:second'
      assert.equal(
        nativeCustomOperatorForSelector(engine, multiple),
        ':SChOsEn;:Ssecond;',
      )
      assert.deepEqual(
        adapter.querySelectorAll(multiple, document),
        engine.select(multiple, document),
      )
      assert.equal(calls, beforeMultiple + 1)
      engine.registerSelector('overlap', /^:ChOsEn(.*)/, (match, source) => ({
        match,
        status: true,
        source: `if(false){${source}}`,
      }))
      assert.deepEqual(
        adapter.querySelectorAll(':ChOsEn', document),
        engine.select(':ChOsEn', document),
      )
      assert.equal(calls, beforeBare + 6)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'plain pass-through pseudo callbacks translate to Rust',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM('<p></p><i></i>')
    try {
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        window.document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args: Parameters<NativeQueryBinding['queryHost']>) {
              calls++
              return binding.queryHost(...args)
            },
          },
        },
      )
      const p = window.document.querySelector('p')!
      adapter.engine.registerSelector(
        'plugin:block',
        /^:block(.*)/,
        (match, source) => {
          return { match, status: true, source }
        },
      )
      assert.equal(adapter.querySelector('p:block', window.document), p)
      assert.equal(calls, 1)

      const entry = adapter.engine.Selectors['plugin:block']!
      entry.Callback = function (match, source) {
        return { match, status: true, source }
      }
      adapter.engine.configure({}, true)
      assert.equal(adapter.querySelector('p:block', window.document), p)
      assert.equal(calls, 2)
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'registered identity symbols match v3 across query methods',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM('<!doctype html><p></p><i></i>')
    try {
      const document = window.document
      let calls = 0
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
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
      const p = document.getElementsByTagName('p')[0]!
      for (const symbol of ['!', '?', '%', '@', '/', '&', '^', '<']) {
        adapter.engine.registerCombinator(symbol, () => '')
        const selector = ['p', 'p', 'p'].join(symbol)
        const before = calls
        assert.deepEqual(
          adapter.querySelectorAll(selector, document),
          adapter.engine.select(selector, document),
        )
        assert.equal(
          adapter.matches(selector, p),
          adapter.engine.match(selector, p),
        )
        assert.equal(
          adapter.closest(selector, p),
          adapter.engine.closest(selector, p),
        )
        assert.equal(calls, before + 3, symbol)
      }
    } finally {
      window.close()
    }
  },
)

test.skipIf(!addon)(
  'jsdom query plans follow operator grammar changes on a warm selector',
  () => {
    const DOMSelector =
      require('../../../dist/adapter/dom-selector.js') as DOMSelectorAdapter
    const binding = require(addon!) as NativeQueryBinding
    const { window } = new JSDOM('<!doctype html><p id="pick"></p>')
    try {
      const grammars: Array<string | undefined> = []
      const document = window.document
      const adapter = new DOMSelector(
        window as unknown as Window & typeof globalThis,
        document,
        {
          nativeQuery: {
            ...binding,
            queryHost(...args) {
              grammars.push(args[15])
              return binding.queryHost(...args)
            },
          },
        },
      )
      const target = document.getElementById('pick')
      const original = adapter.engine.CFG.operators
      assert.equal(adapter.querySelector('[id^=pi]', document), target)
      adapter.engine.CFG.operators = '='
      adapter.engine.configure({}, true)
      assert.throws(() => adapter.querySelector('[id^=pi]', document))
      for (const name of ['is', 'where']) {
        const nested = `:${name}([id^=pi], #pick)`
        assert.equal(adapter.supports(nested), false)
        assert.throws(() => adapter.querySelector(nested, document), {
          name: 'SyntaxError',
        })
      }
      assert.equal(adapter.querySelector('[id=pick]', document), target)
      adapter.engine.CFG.operators = original
      adapter.engine.configure({}, true)
      assert.equal(adapter.querySelector('[id^=pi]', document), target)
      adapter.engine.registerOperator('@=', { p1: '^', p2: '$', p3: 'true' })
      adapter.engine.CFG.operators = '[@]='
      adapter.engine.configure({}, true)
      assert.equal(adapter.querySelector('[id@=pick]', document), target)
      assert.equal(adapter.querySelector('[id=pick]', document), target)
      assert.throws(() => adapter.querySelector('[id^=pi]', document), {
        name: 'SyntaxError',
      })
      adapter.engine.CFG.operators = '@=|\\^=|='
      adapter.engine.configure({}, true)
      assert.equal(adapter.querySelector('[id@=pick]', document), target)
      assert.equal(adapter.querySelector('[id^=pi]', document), target)
      assert.deepEqual(grammars, [
        undefined,
        '=',
        undefined,
        '[@]=',
        '@=|\\^=|=',
        '@=|\\^=|=',
      ])
    } finally {
      window.close()
    }
  },
)
