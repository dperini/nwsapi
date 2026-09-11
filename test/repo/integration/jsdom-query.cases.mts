import assert from 'node:assert/strict'
import { test } from 'vitest'
import { DOMSelector, host } from './fixture/jsdom.mts'

for (const method of ['check', 'supports'] as const) {
  test(`${method} also locks shared setup`, t => {
    const window = host(t)
    const adapter = new DOMSelector(window)
    DOMSelector.configure(window, { LEGACY: true })
    adapter[method]('.item', window.document.getElementById('one')!)
    assert.throws(
      () => DOMSelector.configure(window, { LEGACY: false }),
      /before its first use/,
    )
    assert.throws(
      () => DOMSelector.use(window, adapter.engine),
      /before its first use/,
    )
  })
}

test('real jsdom queries return wrappers and a static NodeList in document order', t => {
  const window = host(t)
  const document = window.document
  const nodes = document.querySelectorAll('#two, .item')
  assert.ok(nodes instanceof window.NodeList)
  assert.deepEqual(
    Array.from(nodes, (n: Element) => n.id),
    ['one', 'two'],
  )
  assert.equal(document.querySelector('#one')!, nodes[0])
  assert.ok(nodes[0] instanceof window.Element)
  assert.equal(nodes[0].matches('.item'), true)
  assert.equal(nodes[0].matches('#two'), false)
  assert.equal(nodes[0].closest('section')!, document.body.firstElementChild!)
  assert.equal(nodes[0].closest('article'), null)
  nodes[0].remove()
  assert.equal(nodes.length, 2)
  assert.equal(document.querySelectorAll('.item').length, 1)
})

test('element, detached subtree, and fragment queries stay in their context', t => {
  const window = host(t)
  const document = window.document
  const section = document.body.firstElementChild!
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
  assert.equal(fragment.querySelector('.item')!, article.firstElementChild!)
  assert.equal(fragment.querySelectorAll('b').length, 1)
  assert.equal(article.firstElementChild!.closest('article')!, article)
  assert.equal(article.matches('article'), true)
})

test('cached selectors see attribute, tree, and stylesheet mutations', t => {
  const window = host(t, '<style>.on { color: red }</style><div></div>')
  const document = window.document
  const node = document.body.firstElementChild!
  assert.equal(document.querySelector('.on'), null)
  node.className = 'on'
  assert.equal(document.querySelector('.on')!, node)
  assert.equal(window.getComputedStyle(node).color, 'rgb(255, 0, 0)')
  document.head.firstElementChild!.textContent = '.on { color: blue }'
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
    window.getComputedStyle(window.document.querySelector('.item')!).color,
    'rgb(0, 0, 255)',
  )
})

test('DOM selector errors use the window SyntaxError and stylesheet errors do not escape', t => {
  const window = host(t)
  const document = window.document
  const node = document.body.firstElementChild!
  for (const call of [
    () => document.querySelector('[')!,
    () => document.querySelectorAll('['),
    () => node.matches('['),
    () => node.closest('[')!,
  ] as const) {
    assert.throws(
      call,
      error =>
        error instanceof window.DOMException &&
        (error instanceof Error ? error.name : String(error)) === 'SyntaxError',
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
  assert.equal(adapter.querySelector('section', document)!, node)
})

test('separate documents and XML preserve ownership and case', t => {
  const a = host(t)
  const b = host(t)
  assert.notEqual(
    a.document.querySelector('.item')!,
    b.document.querySelector('.item')!,
  )
  const xml = host(t, '<root><Item id="upper"/><item id="lower"/></root>', {
    contentType: 'application/xml',
  })
  assert.equal(xml.document.querySelector('Item')!.id, 'upper')
  assert.equal(xml.document.querySelector('item')!.id, 'lower')
})
