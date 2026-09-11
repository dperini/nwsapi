import assert from 'node:assert/strict'
import type * as NodeFs from 'node:fs'
import { createRequire } from 'node:module'
import type * as NodeVm from 'node:vm'
import { test, vi } from 'vitest'
import {
  DOMSelector,
  factory,
  host,
  jsdomRequire,
  require,
} from './fixture/jsdom.mts'
import './jsdom-query.cases.mts'

test('the callable factory and the DOMSelector export coexist', t => {
  const window = host(t)
  assert.equal(typeof factory, 'function')
  assert.equal(typeof DOMSelector, 'function')
  assert.equal(factory(window).first('.item', window.document)!.id, 'one')
})

test('jsdom uses the configured engine without sharing ordinary factory calls', t => {
  const window = host(t)
  const other = host(t)
  DOMSelector.configure(window, { LEGACY: true })
  const engine = new DOMSelector(window).engine
  DOMSelector.configure(window, { IDS_DUPES: true })
  assert.equal(engine.configure()['LEGACY'], true)
  const direct = factory(window)
  assert.notEqual(direct, engine)
  assert.equal(direct.configure()['LEGACY'], false)
  DOMSelector.configure(other, { LEGACY: false })
  const separate = new DOMSelector(other).engine
  assert.notEqual(separate, engine)
  const first = vi.spyOn(engine, 'first')
  assert.equal(window.document.querySelector('#one')!.id, 'one')
  assert.equal(first.mock.calls.length, 1)
  assert.equal(new DOMSelector(window).engine, engine)
  assert.equal(new DOMSelector(other).engine, separate)
})

test('an injected engine handles DOM queries, nested selectors, and styles', t => {
  const window = host(t, '<section id="target"><input></section>')
  const document = window.document
  const engine = factory(window)
  const first = vi.spyOn(engine, 'first')
  const select = vi.spyOn(engine, 'select')
  const match = vi.spyOn(engine, 'match')
  const closest = vi.spyOn(engine, 'closest')
  assert.equal(DOMSelector.use(window, engine), engine)
  const style = document.createElement('style')
  style.textContent = 'section:has(input:-moz-read-only) { display: none }'
  document.head.append(style)
  const target = document.getElementById('target')!
  assert.equal(document.querySelector('section:has(input)'), target)
  assert.equal(document.querySelectorAll('section:has(input)')[0], target)
  assert.equal(target.matches('section:has(input)'), true)
  assert.equal(target.closest('section')!, target)
  for (const spy of [first, select, match, closest] as const) {
    assert.ok(spy.mock.calls.length > 0)
  }
  match.mockClear()
  assert.equal(window.getComputedStyle(target).display, 'block')
  assert.ok(match.mock.calls.some(call => call[0].includes(':-moz-read-only')))
  assert.equal(engine.configure()['VERBOSITY'], true)
  assert.throws(
    () => document.querySelector('section:has(input:-moz-read-only)'),
    { name: 'SyntaxError' },
  )
  const adapter = new DOMSelector(window)
  assert.equal(adapter.engine, engine)
  assert.equal(
    adapter.matches(':-moz-read-only', target, { noexcept: true }),
    false,
  )
  assert.equal(
    adapter.check('section:has(input:-moz-read-only)', target).match,
    false,
  )
  assert.equal(adapter.supports(':-moz-read-only'), false)
  assert.throws(() => target.matches(':-moz-read-only'), {
    name: 'SyntaxError',
  })
  assert.equal(engine.configure()['VERBOSITY'], true)
})

test('configuration clears an injected engine warmed before adapter setup', t => {
  const window = host(t)
  const engine = factory(window)
  const node = window.document.getElementById('one')!
  const selector = ':is(:unknown, .item)'
  assert.equal(engine.match(selector, node), true)
  assert.equal(engine.select(selector, window.document).length, 2)
  DOMSelector.use(window, engine)
  assert.equal(engine.match(selector, node), true)
  DOMSelector.configure(window, { FORGIVING: false })
  assert.equal(engine.configure()['FORGIVING'], false)
  assert.throws(() => window.document.querySelector(selector)!, {
    name: 'SyntaxError',
  })
  assert.throws(() => node.matches(selector), { name: 'SyntaxError' })
  assert.equal(new DOMSelector(window).check(selector, node).match, false)
})

test('adapter setup rejects silent engines without changing their configuration', t => {
  const window = host(t)
  const engine = factory(window)
  engine.configure({ VERBOSITY: false })
  assert.throws(() => DOMSelector.use(window, engine), /VERBOSITY: true/)
  assert.equal(engine.configure()['VERBOSITY'], false)
  assert.throws(
    () => DOMSelector.configure(window, { VERBOSITY: false }),
    /VERBOSITY: true/,
  )
  DOMSelector.configure(window, { VERBOSITY: true })
  const configured = new DOMSelector(window).engine
  assert.equal(configured.configure()['VERBOSITY'], true)
  assert.throws(() => window.document.querySelector('[')!, {
    name: 'SyntaxError',
  })
})

test('setup ignores inherited options and locks on the first query', t => {
  const window = host(t)
  const options = Object.create({ VERBOSITY: false, FORGIVING: false })
  options.LEGACY = true
  DOMSelector.configure(window, options)
  const adapter = new DOMSelector(window)
  const engine = adapter.engine
  assert.equal(engine.configure()['FORGIVING'], true)
  assert.equal(engine.configure()['LEGACY'], true)
  assert.equal(new DOMSelector(window).engine, engine)
  adapter.matches('.item', window.document.getElementById('one')!)
  assert.throws(
    () => DOMSelector.configure(window, { FORGIVING: false }),
    /before its first use/,
  )
  assert.throws(() => DOMSelector.use(window, engine), /before its first use/)
  assert.equal(engine.configure()['FORGIVING'], true)
})

test('injection rejects wrong documents and replacement engines', t => {
  const window = host(t)
  const other = host(t)
  const engine = factory(window)
  assert.throws(
    () => DOMSelector.use(window, {} as typeof NW.Dom),
    /engine for this document/,
  )
  assert.throws(
    () => DOMSelector.use(other, engine),
    /engine for this document/,
  )
  DOMSelector.use(window, engine)
  assert.equal(DOMSelector.use(window, engine), engine)
  assert.throws(
    () => DOMSelector.use(window, factory(window)),
    /already has an adapter engine/,
  )
  // A cross-document query changes Snapshot.doc, but not binding ownership.
  engine.select('section', other.document)
  assert.throws(
    () => DOMSelector.use(other, engine),
    /bound to another document/,
  )
})

test('a bound engine must still throw when jsdom first queries it', t => {
  const window = host(t)
  DOMSelector.configure(window, {})
  const engine = new DOMSelector(window).engine
  engine.configure({ VERBOSITY: false })
  assert.throws(
    () => window.document.querySelector('section')!,
    /VERBOSITY: true/,
  )
  engine.configure({ VERBOSITY: true })
  assert.equal(window.document.querySelector('section')!.localName, 'section')
})

test('beforeParse can configure before the document has a root element', t => {
  const options = { LEGACY: true }
  const window = host(
    t,
    '<style>.item { color: red }</style><div class="item"></div>',
    {
      beforeParse(earlyWindow) {
        assert.equal(earlyWindow.document.documentElement, null)
        DOMSelector.configure(earlyWindow, options)
        DOMSelector.configure(earlyWindow, { IDS_DUPES: true })
      },
    },
  )
  options.LEGACY = false
  const node = window.document.querySelector('.item')!
  assert.equal(new DOMSelector(window).engine.configure()['LEGACY'], true)
  assert.equal(window.getComputedStyle(node).color, 'rgb(255, 0, 0)')
  assert.throws(
    () => DOMSelector.configure(window, { LEGACY: false }),
    /before its first use/,
  )
})

test('separately loaded adapter copies share configuration, binding, and setup locks', t => {
  const fs = require('node:fs') as typeof NodeFs
  const vm = require('node:vm') as typeof NodeVm
  const entry = process.env['JSDOM_PACKAGE']
    ? jsdomRequire.resolve('@asamuzakjp/dom-selector')
    : require.resolve('../../../dist/nwsapi.js')
  const adapterPath = createRequire(entry).resolve(
    process.env['JSDOM_PACKAGE']
      ? './dom-selector.js'
      : './adapter/dom-selector.js',
  )
  const copy: { exports: typeof DOMSelector | undefined } = {
    exports: undefined,
  }
  vm.runInNewContext(fs.readFileSync(adapterPath, 'utf8'), {
    module: copy,
    require: createRequire(adapterPath),
  })
  const OtherAdapter = copy.exports
  assert.notEqual(OtherAdapter, DOMSelector)
  const window = host(t)
  const engine = factory(window)
  OtherAdapter!.configure(window, { LEGACY: true })
  assert.equal(OtherAdapter!.use(window, engine), engine)
  const adapter = new DOMSelector(window)
  assert.equal(adapter.engine, engine)
  assert.equal(engine.configure()['LEGACY'], true)
  const first = vi.spyOn(engine, 'first')
  assert.equal(window.document.querySelector('#one')!.id, 'one')
  assert.equal(first.mock.calls.length, 1)
  assert.throws(
    () => OtherAdapter!.configure(window, { LEGACY: false }),
    /before its first use/,
  )
  assert.throws(() => OtherAdapter!.use(window, engine), /before its first use/)
  const other = host(t)
  engine.select('section', other.document)
  assert.throws(
    () => DOMSelector.use(other, engine),
    /bound to another document/,
  )
  assert.throws(
    () => OtherAdapter!.use(other, engine),
    /bound to another document/,
  )
})

import './jsdom-stylesheet.cases.mts'

import './jsdom-regression.cases.mts'
