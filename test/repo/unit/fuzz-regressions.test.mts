import { expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

test('CSS attribute name escapes cannot become JavaScript octal escapes', t => {
  const dom = new JSDOM('<!doctype html><p data-value="a"></p>')
  t.onTestFinished(() => dom.window.close())
  const engine = factory(dom.window)
  const document = dom.window.document
  const node = document.getElementsByTagName('p')[0]!
  for (const selector of ['p[\\64 ata-value]', 'p[data-\\76 alue="a"]']) {
    expect(Array.from(engine.select(selector, document))).toEqual([node])
    expect(engine.first(selector, document)).toBe(node)
    expect(engine.match(selector, node)).toBe(true)
  }
  // Minimized by the coverage-guided byte fuzzer.
  const selector = String.fromCharCode(92, 92, 92, 92, 91, 92, 51)
  expect(Array.from(engine.select(selector, document))).toEqual([])
  expect(engine.first(selector, document)).toBe(null)
  expect(() => engine.match(selector, node)).toThrow(dom.window.DOMException)
})

test('escaped type selectors compile as CSS identifiers, not JavaScript escapes', t => {
  const dom = new JSDOM('<!doctype html><au><p></p></au>')
  t.onTestFinished(() => dom.window.close())
  const engine = factory(dom.window)
  const document = dom.window.document
  const child = document.getElementsByTagName('p')[0]!
  for (const selector of ['a\\u p', 'a\\75>p']) {
    expect(Array.from(engine.select(selector, document))).toEqual([child])
    expect(engine.first(selector, document)).toBe(child)
    expect(engine.match(selector, child)).toBe(true)
  }
  expect(Array.from(engine.select('A\\u _', document))).toEqual([])
})
