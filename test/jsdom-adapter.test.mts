import type { ConstructorOptions } from 'jsdom'
import { test, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
// The installed-package check runs this suite without substituting anything.
const jsdomRequire = createRequire(
  process.env.JSDOM_PACKAGE || require.resolve('jsdom'),
)
const factory = process.env.JSDOM_PACKAGE
  ? jsdomRequire('@asamuzakjp/dom-selector')
  : require('../src/nwsapi.js')
const { DOMSelector } = factory
if (!process.env.JSDOM_PACKAGE) {
  const path = jsdomRequire.resolve('@asamuzakjp/dom-selector')
  jsdomRequire(path)
  require.cache[path].exports = factory
}
if (process.env.JSDOM_PACKAGE) {
  assert.equal(
    jsdomRequire('@asamuzakjp/dom-selector/package.json').name,
    'nwsapi',
  )
}
assert.equal(jsdomRequire('@asamuzakjp/dom-selector'), factory)
const { JSDOM } = jsdomRequire('jsdom')

function host(
  t,
  html = '<!doctype html><section><div class="item" id="one"></div><div class="item" id="two"></div></section>',
  options?: ConstructorOptions,
) {
  const dom = new JSDOM(html, options)
  t.onTestFinished(() => dom.window.close())
  return dom.window
}

test('the callable factory and the DOMSelector export coexist', t => {
  const window = host(t)
  assert.equal(typeof factory, 'function')
  assert.equal(typeof DOMSelector, 'function')
  assert.equal(factory(window).first('.item', window.document).id, 'one')
})

test('real jsdom queries return wrappers and a static NodeList in document order', t => {
  const window = host(t)
  const document = window.document
  const nodes = document.querySelectorAll('#two, .item')
  assert.ok(nodes instanceof window.NodeList)
  assert.deepEqual(
    Array.from(nodes, (n: Element) => n.id),
    ['one', 'two'],
  )
  assert.equal(document.querySelector('#one'), nodes[0])
  assert.ok(nodes[0] instanceof window.Element)
  assert.equal(nodes[0].matches('.item'), true)
  assert.equal(nodes[0].matches('#two'), false)
  assert.equal(nodes[0].closest('section'), document.body.firstElementChild)
  assert.equal(nodes[0].closest('article'), null)
  nodes[0].remove()
  assert.equal(nodes.length, 2)
  assert.equal(document.querySelectorAll('.item').length, 1)
})

test('element, detached subtree, and fragment queries stay in their context', t => {
  const window = host(t)
  const document = window.document
  const section = document.body.firstElementChild
  assert.equal(section.querySelector('section'), null)
  assert.deepEqual(
    Array.from(
      section.querySelectorAll(':scope > .item'),
      (n: Element) => n.id,
    ),
    ['one', 'two'],
  )
  const fragment = document.createDocumentFragment()
  const article = document.createElement('article')
  article.innerHTML = '<b class="item"></b>'
  fragment.append(article)
  assert.equal(fragment.querySelector('.item'), article.firstElementChild)
  assert.equal(fragment.querySelectorAll('b').length, 1)
  assert.equal(article.firstElementChild.closest('article'), article)
  assert.equal(article.matches('article'), true)
})

test('cached selectors see attribute, tree, and stylesheet mutations', t => {
  const window = host(t, '<style>.on { color: red }</style><div></div>')
  const document = window.document
  const node = document.body.firstElementChild
  assert.equal(document.querySelector('.on'), null)
  node.className = 'on'
  assert.equal(document.querySelector('.on'), node)
  assert.equal(window.getComputedStyle(node).color, 'rgb(255, 0, 0)')
  document.head.firstElementChild.textContent = '.on { color: blue }'
  assert.equal(window.getComputedStyle(node).color, 'rgb(0, 0, 255)')
  node.className = ''
  assert.equal(document.querySelector('.on'), null)
})

test('CSS matching supplies specificity and excludes nonmatching list branches', t => {
  const window = host(
    t,
    '<style>#missing, .item { color: red } section .item { color: blue } .item::before { color: green }</style><section><div class="item"></div></section>',
  )
  assert.equal(
    window.getComputedStyle(window.document.querySelector('.item')).color,
    'rgb(0, 0, 255)',
  )
})

test('DOM selector errors use the window SyntaxError and stylesheet errors do not escape', t => {
  const window = host(t)
  const document = window.document
  const node = document.body.firstElementChild
  for (const call of [
    () => document.querySelector('['),
    () => document.querySelectorAll('['),
    () => node.matches('['),
    () => node.closest('['),
  ]) {
    assert.throws(
      call,
      error =>
        error instanceof window.DOMException && error.name === 'SyntaxError',
    )
  }
  const adapter = new DOMSelector(window)
  assert.equal(adapter.check('[', node).match, false)
  assert.equal(adapter.matches('[', node, { noexcept: true }), false)
  assert.equal(adapter.supports('div'), true)
  assert.equal(adapter.supports('['), false)
  assert.equal(adapter.supports(undefined), false)
  assert.throws(() => adapter.matches('div', document), window.TypeError)
  adapter.clear()
  adapter.clear(true)
  assert.equal(adapter.querySelector('section', document), node)
})

test('separate documents and XML preserve ownership and case', t => {
  const a = host(t)
  const b = host(t)
  assert.notEqual(
    a.document.querySelector('.item'),
    b.document.querySelector('.item'),
  )
  const xml = host(t, '<root><Item id="upper"/><item id="lower"/></root>', {
    contentType: 'application/xml',
  })
  assert.equal(xml.document.querySelector('Item').id, 'upper')
  assert.equal(xml.document.querySelector('item').id, 'lower')
})

test('DOM-only calls leave the CSS parser and syntax cache unloaded', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const document = window.document
  const node = document.body.firstElementChild
  adapter.querySelector('section', document)
  adapter.querySelectorAll('div', node)
  adapter.matches('section', node)
  adapter.closest('section', node)
  adapter.supports('section')
  adapter.extractSubjects('section')
  adapter.clear(true)
  assert.equal(adapter.css, undefined)
  assert.equal(adapter.selectors, undefined)
  assert.equal(adapter.check('section', node).match, true)
  assert.equal(typeof adapter.css.parse, 'function')
  assert.equal(adapter.selectors.size, 1)
})

test('stylesheet checks reuse syntax but not match results or result lists', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const node = window.document.body.firstElementChild
  adapter.check('section', node)
  const css = adapter.css
  let parses = 0,
    generations = 0
  adapter.css = {
    ...css,
    parse(...args) {
      parses++
      return css.parse(...args)
    },
    generate(...args) {
      generations++
      return css.generate(...args)
    },
  }
  const selector = '#changed, section'
  const first = adapter.check(selector, node)
  assert.equal(first.ast.children.size, 1)
  node.id = 'changed'
  adapter.clear()
  const second = adapter.check(selector, node)
  assert.equal(second.ast.children.size, 2)
  assert.equal(first.ast.children.size, 1)
  assert.equal(parses, 1)
  assert.equal(generations, 2)
  adapter.clear(true)
  adapter.check(selector, node)
  assert.equal(parses, 2)
  assert.equal(generations, 4)
})

test('stylesheet syntax cache stays bounded and evicted selectors still work', t => {
  const window = host(t)
  const adapter = new DOMSelector(window)
  const node = window.document.body.firstElementChild
  for (let i = 0; i < 300; i++) {
    adapter.check('.item' + i, node)
  }
  assert.equal(adapter.selectors.size, 256)
  assert.equal(adapter.selectors.has('.item0'), false)
  node.className = 'item0'
  assert.equal(adapter.check('.item0', node).match, true)
  assert.equal(adapter.selectors.size, 256)
})

test('a missing CSS peer only fails when stylesheet matching needs it', t => {
  const window = host(t)
  const Module = require('node:module')
  const entry = process.env.JSDOM_PACKAGE
    ? jsdomRequire.resolve('@asamuzakjp/dom-selector')
    : require.resolve('../src/nwsapi.js')
  const path = createRequire(entry).resolve('./dom-selector.js')
  const original = Module.prototype.require
  let loads = 0,
    factoryLoads = 0
  const missing = new Error('Missing css-tree peer')
  const requireSpy = vi
    .spyOn(Module.prototype, 'require')
    .mockImplementation(function (name) {
      if (this.filename === path && name === './nwsapi.js') {
        factoryLoads++
      }
      if (this.filename === path && name === 'css-tree') {
        loads++
        throw missing
      }
      return original.apply(this, arguments)
    })
  try {
    const adapter = new DOMSelector(window)
    const second = new DOMSelector(window)
    assert.notEqual(adapter.engine, second.engine)
    assert.equal(
      factoryLoads,
      0,
      'instances reuse the captured factory without requiring it again',
    )
    const document = window.document
    assert.equal(
      adapter.querySelector('section', document),
      document.body.firstElementChild,
    )
    assert.equal(
      adapter.matches('section', document.body.firstElementChild),
      true,
    )
    assert.equal(loads, 0)
    assert.throws(
      () => adapter.check('section', document.body.firstElementChild),
      error => error === missing,
    )
    assert.equal(loads, 1)
  } finally {
    requireSpy.mockRestore()
  }
})
