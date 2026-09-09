import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('cached groups preserve order, deduplication, callbacks and independent results', t => {
  const { window } = new JSDOM(
    '<!doctype html><p class="a b"></p><p class="b"></p><p class="a"></p>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = registerLegacy(factory(window))
  const nodes = Array.from(doc.querySelectorAll('p'))
  const selector = '.b,.a.b,.a'
  for (const legacy of [false, true]) {
    for (const nodeList of [false, true]) {
      engine.configure({ LEGACY: legacy, NODE_LIST: nodeList })
      nodes[1]!.className = 'b'
      assert.deepEqual(Array.from(engine.select(selector, doc)), nodes)
      const first = engine.select(selector, doc)
      const second = engine.select(selector, doc)
      assert.notEqual(first, second)
      assert.deepEqual(Array.from(second), nodes)
      if (Array.isArray(first)) {
        first.length = 0
        assert.deepEqual(Array.from(engine.select(selector, doc)), nodes)
      }
      const visited: Element[] = []
      engine.select(selector, doc, element => {
        visited.push(element)
        nodes[1]!.className = ''
        assert.deepEqual(Array.from(engine.select(selector, doc)), [
          nodes[0],
          nodes[2],
        ])
        return true
      })
      assert.deepEqual(visited, nodes)
      assert.deepEqual(Array.from(engine.select(selector, doc)), [
        nodes[0],
        nodes[2],
      ])
      const fragment = doc.createDocumentFragment()
      const item = doc.createElement('p')
      item.className = 'a b'
      fragment.append(item)
      assert.deepEqual(Array.from(engine.select(selector, fragment)), [item])
      assert.deepEqual(Array.from(engine.select(selector, fragment)), [item])
    }
  }
})

test('group merging handles empty runs, nested nodes and reordered fragments', t => {
  const { window } = new JSDOM('<!doctype html><body></body>')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const roots = [
    window.document.createDocumentFragment(),
    new window.DOMParser().parseFromString('<root/>', 'application/xml')
      .documentElement,
  ]
  for (const root of roots) {
    const doc = root.ownerDocument!
    const expected: Element[] = []
    for (let i = 0; i < 32; ++i) {
      const parent = doc.createElement('section')
      const item = doc.createElement('p')
      item.setAttribute('class', 'hit g' + (i % 7))
      parent.append(item)
      root.append(parent, doc.createTextNode(' gap '), doc.createComment('gap'))
      expected.push(item)
    }
    const selector = '.missing,.g6,.g5,.g4,.hit,.g3,.g2,.g1,.g0'
    for (const legacy of [false, true]) {
      for (const nodeList of [false, true]) {
        engine.configure({ LEGACY: legacy, NODE_LIST: nodeList })
        assert.deepEqual(Array.from(engine.select(selector, root)), expected)
        assert.deepEqual(Array.from(engine.select(selector, root)), expected)
        const first = expected.shift()!
        root.append(first.parentNode!)
        expected.push(first)
        assert.deepEqual(Array.from(engine.select(selector, root)), expected)
        const visited: Element[] = []
        engine.select(selector, root, element => {
          visited.push(element)
          return false
        })
        assert.deepEqual(visited, [expected[0]])
      }
    }
  }
})

test('ordered groups still sort late inversions and remove boundary duplicates', t => {
  const { window } = new JSDOM(
    '<!doctype html><p class="a"></p><p class="b shared"></p><p class="c"></p><p class="d"></p>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = registerLegacy(factory(window))
  for (const legacy of [false, true]) {
    for (const nodeList of [false, true]) {
      engine.configure({ LEGACY: legacy, NODE_LIST: nodeList })
      for (const selector of [
        '.a,.b,.c,.d',
        '.a,.b,.d,.c',
        '.a,.b,.shared,.c,.d',
        '.a,.missing,.b,.c,.d',
      ]) {
        const expected = Array.from(doc.querySelectorAll(selector))
        assert.deepEqual(Array.from(engine.select(selector, doc)), expected)
        const first = engine.select(selector, doc)
        const second = engine.select(selector, doc)
        assert.deepEqual(Array.from(first), expected)
        assert.deepEqual(Array.from(second), expected)
        assert.notEqual(first, second)
      }
      const first = doc.body.firstElementChild!
      doc.body.append(first)
      assert.deepEqual(
        Array.from(engine.select('.a,.b,.c,.d', doc)),
        Array.from(doc.querySelectorAll('p')),
      )
      doc.body.prepend(first)
    }
  }
})
