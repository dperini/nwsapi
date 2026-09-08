import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('heading levels validate integer lists and use HTML local names', t => {
  const { window } = new JSDOM('<h1></h1><h2></h2><h7></h7>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  const prefixed = doc.createElementNS('http://www.w3.org/1999/xhtml', 'h:h1')
  doc.body.append(prefixed, doc.createElementNS('urn:other', 'h1'))
  expect(engine.select(':heading', doc)).toHaveLength(3)
  expect(engine.match(':heading(+1, -2, 7)', prefixed)).toBe(true)
  expect(engine.match(':heading(0, 7)', prefixed)).toBe(false)
  for (const selector of [
    ':heading()',
    ':heading(1.5)',
    ':heading(1,)',
    ':heading(one)',
  ]) {
    expect(() => engine.select(selector, doc)).toThrow()
  }
})

test('document roots and namespace errors remain correct after root replacement', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const doc = window.document
  doc.documentElement.remove()
  const engine = factory(window)
  expect(() => engine.select('ns|div', doc)).toThrowError(
    expect.objectContaining({ name: 'SyntaxError' }),
  )
  const root = doc.createElement('html')
  doc.append(root)
  expect(engine.match(':root', root)).toBe(true)
  expect(engine.select(':scope', doc)).toEqual([root])
  expect(() => Reflect.apply(engine.first, engine, [])).toThrow(TypeError)
})

test('explicit attribute case flags override HTML defaults', t => {
  const { window } = new JSDOM('<input type="TEXT" placeholder="hint">')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const input = window.document.querySelector('input')!
  expect(engine.match('[type="text" i]', input)).toBe(true)
  expect(engine.match('[type="text" s]', input)).toBe(false)
  expect(engine.match('[type="TEXT" S]', input)).toBe(true)
  expect(engine.match(':placeholder-shown', input)).toBe(true)
  input.value = 'filled'
  expect(engine.match(':placeholder-shown', input)).toBe(false)
})
