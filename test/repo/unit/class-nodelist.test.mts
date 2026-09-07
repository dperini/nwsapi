import { test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js')

test('fragment class lookup does not throw with NODE_LIST enabled', t => {
  const { window } = new JSDOM('', { url: 'https://example.test/' })
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  engine.configure({ NODE_LIST: true })
  const fragment = window.document.createDocumentFragment()
  const first = window.document.createElement('div')
  const second = window.document.createElement('div')
  first.className = second.className = 'item'
  fragment.append(first, second)
  const nodes = engine.byClass('item', fragment)
  expect(nodes.length).toBe(2)
  expect(nodes[0]).toBe(first)
  expect(nodes[1]).toBe(second)
})
