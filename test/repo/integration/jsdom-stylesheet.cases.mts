import assert from 'node:assert/strict'
import type * as NodeModule from 'node:module'
import type ModuleInstance from 'node:module'
import { createRequire } from 'node:module'
import { test, vi } from 'vitest'
import { DOMSelector, host, require } from './fixture/jsdom.mts'

test('DOM-only calls leave the CSS parser and syntax cache unloaded', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const document = window.document
  const node = document.body.firstElementChild!
  adapter.querySelector('section', document)!
  adapter.querySelectorAll('div', node)
  adapter.matches('section', node)
  adapter.closest('section', node)!
  adapter.supports('section')
  adapter.extractSubjects('section')
  adapter.clear(true)
  assert.equal(adapter.css, undefined)
  assert.equal(adapter.selectors, undefined)
  assert.equal(adapter.check('section', node).match, true)
  assert.equal(typeof adapter.css!.parse, 'function')
  assert.equal(adapter.selectors!.size, 1)
})

test('stylesheet checks reuse syntax but not match results or result lists', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const node = window.document.body.firstElementChild!
  adapter.check('section', node)
  assert.ok(adapter.css)
  adapter.css = { ...adapter.css }
  const parse = vi.spyOn(adapter.css, 'parse')
  const generate = vi.spyOn(adapter.css, 'generate')
  const selector = '#changed, section'
  const first = adapter.check(selector, node)
  assert.equal(first.ast!.children.size, 1)
  node.id = 'changed'
  adapter.clear()
  const second = adapter.check(selector, node)
  assert.equal(second.ast!.children.size, 2)
  assert.equal(first.ast!.children.size, 1)
  assert.equal(parse.mock.calls.length, 1)
  assert.equal(generate.mock.calls.length, 2)
  adapter.clear(true)
  adapter.check(selector, node)
  assert.equal(parse.mock.calls.length, 2)
  assert.equal(generate.mock.calls.length, 4)
})

test('stylesheet syntax cache stays bounded and evicted selectors still work', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const node = window.document.body.firstElementChild!
  for (let i = 0; i < 300; i++) {
    adapter.check('.item' + i, node)
  }
  assert.equal(adapter.selectors!.size, 256)
  assert.equal(adapter.selectors!.has('.item0'), false)
  node.className = 'item0'
  assert.equal(adapter.check('.item0', node).match, true)
  assert.equal(adapter.selectors!.size, 256)
})

test('a missing CSS peer only fails when stylesheet matching needs it', t => {
  const window = host(t)
  const Module = require('node:module') as typeof NodeModule
  const path = createRequire(
    require.resolve('../../../dist/nwsapi.js'),
  ).resolve('./adapter/dom-selector.js')
  // Save the method before replacing it; the call below supplies its receiver.
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the original receiver.
  const original = Module.prototype.require
  let loads = 0,
    factoryLoads = 0
  const missing = new Error('Missing css-tree peer')
  const requireSpy = vi
    .spyOn(Module.prototype, 'require')
    .mockImplementation(function (this: ModuleInstance, name) {
      if (this.filename === path && name === '../nwsapi.js') {
        factoryLoads++
      }
      if (this.filename === path && name === 'css-tree') {
        loads++
        throw missing
      }
      return original.call(this, name)
    })
  try {
    const adapter = new DOMSelector(window)
    const second = new DOMSelector(window)
    assert.equal(adapter.engine, second.engine)
    assert.equal(
      factoryLoads,
      0,
      'instances reuse the captured factory without requiring it again',
    )
    const document = window.document
    assert.equal(
      adapter.querySelector('section', document)!,
      document.body.firstElementChild!,
    )
    assert.equal(
      adapter.matches('section', document.body.firstElementChild!),
      true,
    )
    assert.equal(loads, 0)
    assert.throws(
      () => adapter.check('section', document.body.firstElementChild!),
      error => error === missing,
    )
    assert.equal(loads, 1)
  } finally {
    requireSpy.mockRestore()
  }
})

test('stylesheet checks ignore non-elements and query APIs reject invalid contexts', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  for (const node of [
    null,
    window.document,
    window.document.createTextNode('text'),
  ] as const) {
    assert.deepEqual(adapter.check('section', node), {
      ast: null,
      match: false,
      pseudoElement: null,
    })
  }
  assert.throws(
    () =>
      adapter.querySelector('section', window.document.createTextNode('text')!),
    /Document, DocumentFragment, or Element/,
  )
})

for (const [method, fallback] of [
  ['matches', false],
  ['closest', null],
  ['querySelector', null],
  ['querySelectorAll', []],
] as const) {
  test(`${method} preserves throwing and noexcept contracts without poisoning subsequent queries`, t => {
    const window = host(t)
    const adapter = new DOMSelector(window)
    const node = window.document.getElementById('one')!
    for (const context of [
      null,
      window.document.createTextNode('text'),
    ] as const) {
      assert.throws(() => adapter[method]('.item', context), window.TypeError)
      assert.deepEqual(
        adapter[method]('.item', context, { noexcept: true }),
        fallback,
      )
    }
    assert.throws(() => adapter[method]('[', node), { name: 'SyntaxError' })
    assert.deepEqual(adapter[method]('[', node, { noexcept: true }), fallback)
    assert.equal(adapter.matches('.item', node), true)
    assert.equal(adapter.engine.configure()['VERBOSITY'], true)
    assert.throws(() => adapter[method]('[', node), { name: 'SyntaxError' })
  })
}

test('noexcept query results and subject hints are independently owned', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const first = adapter.querySelectorAll('[', window.document, {
    noexcept: true,
  })
  first.push(window.document.body)
  assert.deepEqual(
    adapter.querySelectorAll('[', window.document, { noexcept: true }),
    [],
  )
  const subjects = adapter.extractSubjects('.item')
  subjects[0]!.id = 'mutated'
  subjects.push({ id: 'extra', className: null, tag: null })
  assert.deepEqual(adapter.extractSubjects('#one'), [
    { id: null, className: null, tag: null },
  ])
})
