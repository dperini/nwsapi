import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import installLegacy from '../../../dist/modules/nwsapi-legacy.js'
import type { LegacyHookFactory } from '../../../src/internal/legacy.d.ts'
import { legacyHost } from '../fixtures/legacy-host.mts'
import { registerLegacyInContext } from '../common/legacy.mts'

const filename = fileURLToPath(
  new URL('../../../dist/modules/nwsapi-legacy.js', import.meta.url),
)
const legacySource = readFileSync(filename, 'utf8')

test('registration keeps the engine, its public methods, and selector extensions', t => {
  const { window } = new JSDOM('<p data-kind="saved"></p>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const select = engine.select
  const snapshot = engine.Snapshot
  const includes = snapshot.includes
  engine.registerSelector('saved', /^:saved(.*)/, (match, source) => ({
    match,
    status: true,
    source: 'if(e.getAttribute("data-kind")==="saved"){' + source + '}',
  }))
  expect(() => engine.configure({ LEGACY: true })).toThrow('nwsapi-legacy.js')
  expect(installLegacy(engine)).toBe(engine)
  expect(engine.select).toBe(select)
  expect(engine.Snapshot).toBe(snapshot)
  engine.configure({ LEGACY: true })
  expect(snapshot.includes).not.toBe(includes)
  expect(snapshot.includes('saved', 'ave')).toBe(true)
  expect(snapshot.includes('saved', 'missing')).toBe(false)
  expect(engine.select('p:saved')).toEqual([window.document.querySelector('p')])
  engine.configure({ LEGACY: false })
  expect(snapshot.includes).toBe(includes)
  expect(engine.select('p:saved')).toEqual([window.document.querySelector('p')])
  expect(installLegacy(engine)).toBe(engine)
})

test('hook factories run once per engine and detect an older DOM at registration', t => {
  const { window } = new JSDOM('<p class="item"></p>')
  t.onTestFinished(() => window.close())
  let create: LegacyHookFactory | undefined
  installLegacy({
    registerLegacyHooks(value: LegacyHookFactory) {
      create = value
      return true
    },
  } as typeof NW.Dom)
  let calls = 0
  const hookFactory: LegacyHookFactory = context => {
    ++calls
    return create!(context)
  }
  const modern = factory(window)
  const old = factory({
    document: legacyHost(window.document),
    DOMException: window.DOMException,
  })
  expect(modern.registerLegacyHooks(hookFactory)).toBe(true)
  expect(old.registerLegacyHooks(hookFactory)).toBe(true)
  expect(old.registerLegacyHooks(hookFactory)).toBe(false)
  expect(calls).toBe(2)
  expect(modern.configure('LEGACY')).toBe(false)
  expect(old.configure('LEGACY')).toBe(true)
  expect(old.select('.item')).toHaveLength(1)
})

test('the browser module registers on the existing NW.Dom object', t => {
  const dom = new JSDOM('<p class="item"></p>', { runScripts: 'outside-only' })
  t.onTestFinished(() => dom.window.close())
  const context = dom.getInternalVMContext()
  vm.runInContext(
    readFileSync(new URL('../../../dist/nwsapi.js', import.meta.url), 'utf8'),
    context,
  )
  const engine = dom.window.NW.Dom
  vm.runInContext(legacySource, context, { filename })
  expect(dom.window.NW.Dom).toBe(engine)
  engine.configure({ LEGACY: true })
  expect(engine.select('.item')[0]).toBe(dom.window.document.querySelector('p'))
})

test('the AMD module returns an installer for the selected engine', t => {
  const { window } = new JSDOM('<p class="item"></p>')
  t.onTestFinished(() => window.close())
  let install: typeof installLegacy | undefined
  const define = Object.assign(
    (load: () => typeof installLegacy) => {
      install = load()
    },
    { amd: true },
  )
  vm.runInNewContext(legacySource, { define }, { filename })
  const engine = factory(window)
  expect(install!(engine)).toBe(engine)
  engine.configure({ LEGACY: true })
  expect(engine.select('.item')).toHaveLength(1)
})

test('legacy queries run without includes, symbols, or weak collections', t => {
  const { window } = new JSDOM(
    '<main><p class="item"></p><input type="checkbox" checked></main>',
  )
  t.onTestFinished(() => window.close())
  const module = { exports: {} }
  const context = vm.createContext({
    module,
    exports: module.exports,
    Symbol: undefined,
    Map: undefined,
    WeakMap: undefined,
    WeakRef: undefined,
    FinalizationRegistry: undefined,
  })
  vm.runInContext('String.prototype.includes = undefined', context)
  vm.runInContext(
    readFileSync(new URL('../../../dist/nwsapi.js', import.meta.url), 'utf8'),
    context,
  )
  const engine = registerLegacyInContext(
    (module.exports as typeof factory)(window),
    context,
  )
  expect(engine.configure('LEGACY')).toBe(true)
  expect(engine.select('main > .item')).toHaveLength(1)
  expect(engine.select('p:is(.item, :unknown-pseudo)')).toHaveLength(1)
  expect(engine.select(':checked')).toHaveLength(1)
  expect(engine.select(':default')).toHaveLength(1)
  expect(engine.select('input:read-only')).toHaveLength(1)
})

test('frame hooks install in the child DOM and preserve the parent engine', t => {
  /* oxlint-disable typescript/unbound-method -- Compare original and installed method identities. */
  const { window } = new JSDOM('<p class="parent"></p><iframe></iframe>')
  t.onTestFinished(() => window.close())
  const parent = installLegacy(factory(window))
  const frame = window.document.getElementsByTagName('iframe')[0]!
  const child = frame.contentWindow! as unknown as Window & typeof globalThis
  const nativeQuery = child.Document.prototype.querySelector
  parent.install(true)
  window.document.body.dispatchEvent(new window.Event('load'))
  frame.dispatchEvent(new window.Event('load'))
  const engine = child.NW.Dom
  expect(engine).not.toBe(parent)
  expect(child.Document.prototype.querySelector).not.toBe(nativeQuery)
  child.document.body.innerHTML = '<p class="child"></p>'
  engine.configure({ LEGACY: true })
  expect(child.document.querySelector('.child')).toBe(
    child.document.body.firstChild,
  )
  expect(window.document.querySelector('.parent')).toBe(
    window.document.body.firstChild,
  )
  expect(parent.configure('LEGACY')).toBe(false)
  engine.uninstall()
  expect(child.Document.prototype.querySelector).toBe(nativeQuery)
  parent.uninstall()
  /* oxlint-enable typescript/unbound-method */
})
