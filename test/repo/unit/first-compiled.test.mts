import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('compiled first queries preserve group order, validation, scopes, mutations and callbacks', t => {
  const { window } = new JSDOM(
    '<main><section class="card"><button class="primary">first</button><input><button>last</button></section><section><button class="primary">other</button></section></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const doc = window.document
  const main = doc.querySelector('main')!
  const selectors = [
    '.card > button.primary',
    'button:last-child, input',
    'input, button',
    '[class="primary"]',
    'button:nth-child(2n+1)',
    'section:has(> input) > button',
    ':is(button,input)',
    'button:not(.primary)',
    '.missing > button',
    ':scope > section > button',
  ]
  const check = (context: Document | Element | DocumentFragment) => {
    for (const selector of selectors) {
      expect(engine.first(selector, context), selector).toBe(
        context.querySelector(selector),
      )
      expect(engine.first(selector, context), selector).toBe(
        context.querySelector(selector),
      )
    }
  }
  check(doc)
  check(main)
  main.prepend(main.lastElementChild!)
  check(doc)
  expect(() => engine.first('button, :unknown-pseudo', main)).toThrow()
  expect(() =>
    engine.first('.absent > button, :unknown-pseudo', main),
  ).toThrow()
  const calls: Element[] = []
  const expected = doc.querySelector('.card > button')!
  expect(
    engine.first('.card > button, input', doc, node => {
      calls.push(node)
      node.remove()
      expect(engine.first('section > button', doc)).toBe(
        doc.querySelector('section > button'),
      )
    }),
  ).toBe(expected)
  expect(calls).toEqual([expected])
  const fragment = doc.createDocumentFragment()
  fragment.append(main)
  check(fragment)
  engine.configure({ NODE_LIST: true })
  check(fragment)
  engine.configure({ LEGACY: true })
  check(fragment)
})
