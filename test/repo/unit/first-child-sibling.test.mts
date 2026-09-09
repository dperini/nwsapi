import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('first-child sibling predicates preserve compound conditions and combinator boundaries', t => {
  const { window } = new JSDOM(
    '<!doctype html><main><!--before--><div class="a"><i></i></div>text<div class="b"><i></i></div><div class="a b"><i></i></div><div class="b"><i></i></div></main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const main = doc.querySelector('main')!
  const nw = registerLegacy(factory(window))
  const selectors = [
    '.a:first-child ~ .b',
    '.missing:first-child ~ .b',
    '.a:first-child:not(.missing) ~ .b',
    '.a:first-child:not(.a) ~ .b',
    '.a:first-child + .b ~ .b',
    'main:first-child > .a ~ .b',
    'main:first-child .a ~ .b',
    '.a:first-child ~ .b:first-child ~ .b',
    '.a:first-child ~ .b > i',
    ':is(.a:first-child, .b) ~ .b',
    ':not(.a:first-child) ~ .b',
  ]
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const selector of selectors) {
      const expected = Array.from(main.querySelectorAll(selector))
      expect(nw.select(selector, main), selector).toEqual(expected)
      expect(nw.first(selector, main), selector).toBe(expected[0] || null)
      for (const element of main.children) {
        expect(nw.match(selector, element), selector).toBe(
          element.matches(selector),
        )
      }
    }
  }
})

test('first-child sibling lookup remains live for fragment roots and mutating callbacks', t => {
  const { window } = new JSDOM('<!doctype html><div></div>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = registerLegacy(factory(window))
  const fragment = doc.createDocumentFragment()
  const shadow = doc.querySelector('div')!.attachShadow({ mode: 'open' })
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const root of [fragment, shadow]) {
      const a = doc.createElement('p')
      a.className = 'a'
      const b = doc.createElement('p')
      const c = doc.createElement('p')
      root.replaceChildren(doc.createComment('before'), a, b, c)
      expect(nw.select('.a:first-child ~ p', root)).toEqual([b, c])
      const seen: Element[] = []
      nw.select('.a:first-child ~ p', root, element => {
        seen.push(element)
        a.className = ''
      })
      expect(seen).toEqual([b, c])
      expect(nw.select('.a:first-child ~ p', root)).toEqual([])
      a.className = 'a'
      const compiledSeen: Element[] = []
      const resolver = nw.compile('.a:first-child ~ p', true, true)!
      resolver(
        [a, b, c],
        element => {
          compiledSeen.push(element)
          a.className = ''
          return false
        },
        root,
        [],
      )
      expect(compiledSeen).toEqual([b])

      b.className = 'a'
      a.remove()
      expect(nw.select('.a:first-child ~ p', root)).toEqual([c])
    }
  }
})

test('first-child sibling selection reads a bounded number of preceding siblings', t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' + '<p></p>'.repeat(100) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const root = window.document.querySelector('main')!
  const nw = factory(window)
  const reads = vi.spyOn(
    window.Element.prototype,
    'previousElementSibling',
    'get',
  )
  expect(nw.select('p:first-child ~ p', root)).toEqual(
    Array.from(root.children).slice(1),
  )
  expect(reads.mock.calls.length).toBeLessThan(200)
})
