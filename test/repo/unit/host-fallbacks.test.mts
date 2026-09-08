import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js')
const filename = fileURLToPath(
  new URL('../../../src/nwsapi.js', import.meta.url),
)
const source = readFileSync(filename, 'utf8')

test('AMD exports a factory without requiring a browser document', t => {
  const define = Object.assign(vi.fn(), { amd: {} })
  vm.runInNewContext(source, { define }, { filename })
  expect(define).toHaveBeenCalledOnce()
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  expect(define.mock.calls[0][0](window).first('p')).toBe(
    window.document.querySelector('p'),
  )
})

test('weak observer ownership disconnects collected snapshots and tolerates collected observers', () => {
  const references = [],
    finalizers = []
  class Reference {
    value
    constructor(value) {
      this.value = value
      references.push(this)
    }
    deref() {
      return this.value
    }
  }
  class Registry {
    callback
    held
    constructor(callback) {
      this.callback = callback
      finalizers.push(this)
    }
    register(_target, held) {
      this.held = held
    }
  }
  const module = { exports: {} }
  vm.runInNewContext(
    source,
    {
      module,
      exports: module.exports,
      WeakRef: Reference,
      FinalizationRegistry: Registry,
    },
    { filename },
  )
  let callback
  const disconnect = vi.fn(),
    observe = vi.fn()
  class Observer {
    disconnect = disconnect
    observe = observe
    constructor(fn) {
      callback = fn
    }
  }
  const state = { copies: new WeakMap() }
  const observer = Reflect.get(module.exports, '_observeCollections')(
    {},
    { MutationObserver: Observer },
    state,
  )
  const before = state.copies
  callback([], observer)
  expect(state.copies).not.toBe(before)
  references[0].value = undefined
  callback([], observer)
  expect(disconnect).toHaveBeenCalledOnce()
  finalizers[0].callback(finalizers[0].held)
  expect(disconnect).toHaveBeenCalledTimes(2)
  finalizers[0].held.value = undefined
  finalizers[0].callback(finalizers[0].held)
  expect(disconnect).toHaveBeenCalledTimes(2)
  expect(observe).toHaveBeenCalledWith(
    {},
    {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    },
  )
})

test('custom-element definition fallback follows upgrades and customized built-ins without native matches', t => {
  const { window } = new JSDOM(
    '<x-widget></x-widget><button is="x-button"></button>',
  )
  t.onTestFinished(() => window.close())
  // Simulate a host that exposes the registry but has no native selector matcher.
  for (const name of ['matches', 'webkitMatchesSelector']) {
    Object.defineProperty(window.Element.prototype, name, {
      value: undefined,
      configurable: true,
    })
  }
  const engine = factory(window)
  const custom = window.document.getElementsByTagName('x-widget')[0]
  const button = window.document.getElementsByTagName('button')[0]
  expect(engine.match(':defined', custom)).toBe(false)
  expect(engine.match(':defined', button)).toBe(false)
  window.customElements.define('x-widget', class extends window.HTMLElement {})
  window.customElements.define(
    'x-button',
    class extends window.HTMLButtonElement {},
    { extends: 'button' },
  )
  expect(engine.match(':defined', custom)).toBe(true)
  expect(engine.match(':defined', button)).toBe(true)
  const detachedDocument = window.document.implementation.createHTMLDocument()
  expect(
    engine.match(':defined', detachedDocument.createElement('x-widget')),
  ).toBe(false)
  expect(engine.match(':defined', detachedDocument.createElement('div'))).toBe(
    true,
  )
})

test('NODE_LIST gracefully falls back to arrays on hosts with no NodeList interface', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const engine = factory({
    document: window.document,
    DOMException: window.DOMException,
    Element: window.Element,
  })
  engine.configure({ NODE_LIST: true })
  const result = engine.select('p')
  expect(Array.isArray(result)).toBe(true)
  expect(result).toEqual([window.document.querySelector('p')])
})

test('unique-ID lookup handles hits, misses, detached fragments and legacy mode', t => {
  const { window } = new JSDOM('<p id="one"></p><p id="one"></p>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  engine.configure({ IDS_DUPES: false })
  for (const legacy of [false, true]) {
    engine.configure({ LEGACY: legacy })
    expect(engine.byId('one', doc)).toEqual([doc.getElementById('one')])
    expect(engine.byId('missing', doc)).toEqual([])
    const fragment = doc.createDocumentFragment()
    const node = doc.createElement('p')
    node.id = 'detached'
    fragment.append(node)
    expect(engine.byId('detached', fragment)).toEqual([node])
    expect(engine.byId('missing', fragment)).toEqual([])
  }
})

test('legacy readers use available sibling and namespace APIs and return NodeLists', t => {
  const { window } = new JSDOM('<main><p data-a="yes"></p><p></p></main>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  engine.configure({ LEGACY: true, NODE_LIST: true })
  for (const selector of [
    ':fullscreen',
    'p + p',
    'p:nth-last-of-type(2n+1)',
    '*|p',
    '[*|data-a]',
    '.missing',
  ]) {
    const expected =
      selector === '*|p'
        ? Array.from(doc.getElementsByTagName('p'))
        : selector === '[*|data-a]'
          ? [doc.querySelector('p')]
          : Array.from(doc.querySelectorAll(selector))
    expect(Array.from(engine.select(selector, doc)), selector).toEqual(expected)
    const seen = []
    expect(
      Array.from(
        engine.select(selector, doc, node => {
          seen.push(node)
        }),
      ),
      selector,
    ).toEqual(expected)
    expect(seen).toEqual(expected)
  }
})

test('astral CSS escapes work without String.fromCodePoint', t => {
  const { window } = new JSDOM('<p id="😀"></p>')
  t.onTestFinished(() => window.close())
  const context = vm.createContext({
    document: window.document,
    DOMException: window.DOMException,
    Element: window.Element,
  })
  vm.runInContext('String.fromCodePoint = undefined', context)
  vm.runInContext(source, context, { filename })
  const engine = vm.runInContext('NW.Dom', context)
  expect(engine.select('#\\1f600 ', window.document)).toEqual([
    window.document.querySelector('p'),
  ])
  expect(engine.match('#\\1f600 ', window.document.querySelector('p'))).toBe(
    true,
  )
})

test('legacy namespace attributes use host names or attribute-node names', t => {
  const { window } = new JSDOM('<p role="button"></p>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  engine.configure({ LEGACY: true })
  const matches = engine.compile('[*|role]', false)
  for (const [node, expected] of [
    [window.document.querySelector('p'), true],
    [{ attributes: [{ nodeName: 'ns:role', specified: true }] }, true],
    [{ attributes: [{ nodeName: 'ns:role', specified: false }] }, false],
    [{}, false],
  ]) {
    expect(matches(node, undefined, undefined, false)).toBe(expected)
  }
  window.document.designMode = 'on'
  expect(engine.match(':read-write', window.document.querySelector('p'))).toBe(
    true,
  )
  expect(engine.match(':read-write', window.document.createElement('p'))).toBe(
    false,
  )
})
