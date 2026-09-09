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
