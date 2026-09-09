import { registerLegacy } from '../common/legacy.mts'
import type * as Jsdom from 'jsdom'
import type * as NwsapiModule from '../../../dist/nwsapi.js'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
import { test } from 'vitest'
const { JSDOM } = require('jsdom') as typeof Jsdom
const createNwsapi =
  require('../../../dist/nwsapi.js') as typeof NwsapiModule.default
const aliases = [
  'webkitMatchesSelector',
  'mozMatchesSelector',
  'msMatchesSelector',
]

for (const fallback of [false, true] as const) {
  for (const legacy of [false, true] as const) {
    for (const alias of aliases) {
      test(`${fallback ? 'factory' : 'document'} ${alias}, LEGACY=${legacy}`, t => {
        const dom = new JSDOM('<!doctype html>')
        t.onTestFinished(() => dom.window.close())
        const document = fallback
          ? dom.window.document.implementation.createHTMLDocument('')
          : dom.window.document
        const proto = fallback ? {} : dom.window.Element.prototype
        Object.defineProperty(proto, 'matches', {
          configurable: true,
          value: undefined,
        })
        const reads = Object.fromEntries(aliases.map(name => [name, 0]))
        for (const name of aliases) {
          Object.defineProperty(proto, name, {
            configurable: true,
            get() {
              reads[name]!++
              return name === alias ? () => true : undefined
            },
          })
        }
        const node = document.createElement('div')
        node.setAttribute('popover', '')
        document.body.appendChild(node)
        const nw = registerLegacy(
          createNwsapi({
            document,
            Element: { prototype: proto } as unknown as typeof Element,
          }),
        )
        assert.equal(
          Object.values(reads).reduce((a, b) => a + b, 0),
          0,
          'factory creation must not probe aliases before configuration',
        )
        nw.configure({ LEGACY: legacy })
        assert.equal(nw.match(':popover-open', node), legacy)
        const firstReads = { ...reads }
        assert.equal(reads[alias], legacy ? 1 : 0)
        for (let i = 0; i < 50; i++) {
          assert.equal(nw.match(':popover-open', node), legacy)
        }
        assert.deepEqual(
          reads,
          firstReads,
          'cached documents must not repeat alias lookup',
        )
        if (!legacy) {
          assert.ok(Object.values(reads).every(count => count === 0))
        }
      })
    }
  }
}

test('legacy mode caches an absent matcher without rereading the factory prototype', t => {
  const dom = new JSDOM('<!doctype html><div popover></div>')
  t.onTestFinished(() => dom.window.close())
  const proto = dom.window.Element.prototype
  Object.defineProperty(proto, 'matches', {
    configurable: true,
    value: undefined,
  })
  const reads = Object.fromEntries(aliases.map(name => [name, 0]))
  for (const alias of aliases) {
    Object.defineProperty(proto, alias, {
      configurable: true,
      get() {
        reads[alias]!++
        return undefined
      },
    })
  }
  const nw = registerLegacy(createNwsapi(dom.window))
  nw.configure({ LEGACY: true })
  for (let i = 0; i < 50; i++) {
    assert.equal(
      nw.match(':popover-open', dom.window.document.body.firstElementChild!),
      false,
    )
  }
  for (const alias of aliases) {
    assert.equal(reads[alias], 1)
  }
})

for (const legacy of [false, true] as const) {
  test(`standard matches takes precedence, LEGACY=${legacy}`, t => {
    const dom = new JSDOM('<!doctype html><div popover></div>')
    t.onTestFinished(() => dom.window.close())
    const proto = dom.window.Element.prototype
    proto.matches = (() => true) as unknown as Element['matches']
    let reads = 0
    for (const alias of aliases) {
      Object.defineProperty(proto, alias, {
        configurable: true,
        get() {
          reads++
          return () => false
        },
      })
    }
    const nw = registerLegacy(createNwsapi(dom.window))
    nw.configure({ LEGACY: legacy })
    assert.equal(
      nw.match(':popover-open', dom.window.document.body.firstElementChild!),
      true,
    )
    assert.equal(reads, 0)
  })
}
