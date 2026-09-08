import { expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

test('escaped attribute values remain intact during candidate lookup', t => {
  const dom = new JSDOM('<!doctype html><p></p>')
  t.onTestFinished(() => dom.window.close())
  const document = dom.window.document
  const node = document.getElementsByTagName('p')[0]!
  node.setAttribute('data-value', '\\')
  const engine = factory(dom.window)
  for (const selector of [
    '[data-value=\\\\]',
    'p[data-value=\\\\]',
    '[data-value="\\\\"]',
  ]) {
    expect(Array.from(document.querySelectorAll(selector))).toEqual([node])
    expect(Array.from(engine.select(selector, document))).toEqual([node])
    expect(engine.first(selector, document)).toBe(node)
    expect(engine.match(selector, node)).toBe(true)
  }
})

test('eval detector sentinels remain ordinary selector data', t => {
  const dom = new JSDOM(
    '<!doctype html><p vitiate_eval_inject data-value="vitiate_eval_inject"></p>',
  )
  t.onTestFinished(() => dom.window.close())
  const engine = factory(dom.window)
  const document = dom.window.document
  const node = document.getElementsByTagName('p')[0]!
  for (const selector of [
    'p[vitiate_eval_inject]',
    'p[data-value="vitiate_eval_inject"]',
  ]) {
    expect(Array.from(engine.select(selector, document))).toEqual([node])
    expect(engine.first(selector, document)).toBe(node)
    expect(engine.match(selector, node)).toBe(true)
  }
})

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
  expect(() => engine.select(selector, document)).toThrow(
    dom.window.DOMException,
  )
  expect(() => engine.first(selector, document)).toThrow(
    dom.window.DOMException,
  )
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
