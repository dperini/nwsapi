import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

for (const legacy of [false, true]) {
  test(`namespace queries preserve candidate contexts (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<!doctype html><body><section></section></body>',
    )
    t.onTestFinished(() => window.close())
    const document = window.document
    const section = document.querySelector('section')!
    const html = document.createElement('item')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'item')
    const bare = document.createElementNS(null, 'item')
    section.append(html, svg, bare)
    const engine = factory(window)
    engine.configure({ LEGACY: legacy })
    const fragment = document.createDocumentFragment()
    fragment.append(section.cloneNode(true))
    for (const context of [document, section, fragment]) {
      const expected =
        context === fragment
          ? Array.from(fragment.querySelectorAll('item'))
          : [html, svg, bare]
      // Repeat each query to cover candidate collection and cached resolvers.
      for (let run = 0; run < 2; run++) {
        expect(engine.select('*|item', context)).toEqual(expected)
        expect(engine.first('*|item', context)).toBe(expected[0])
        expect(engine.select('|item', context)).toEqual([expected[2]])
        for (const element of expected) {
          expect(engine.match('*|item', element)).toBe(true)
          expect(engine.match('|item', element)).toBe(
            element.namespaceURI === null,
          )
        }
      }
    }
  })
}

for (const legacy of [false, true]) {
  test(`XML local names and type positions use namespace identity (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<s:root xmlns:s="urn:first" xmlns:t="urn:second"><Item id="upper"/><item id="bare"/><s:item id="first"/><t:item id="other"/><s:item id="last"/></s:root>',
      { contentType: 'application/xml' },
    )
    t.onTestFinished(() => window.close())
    const doc = window.document
    const engine = factory(window)
    engine.configure({ LEGACY: legacy })
    const fragment = doc.createDocumentFragment()
    fragment.append(
      ...Array.from(doc.documentElement.children, child =>
        child.cloneNode(true),
      ),
    )
    const cases = new Map([
      ['Item', ['upper']],
      ['item', ['bare', 'first', 'other', 'last']],
      ['*|item', ['bare', 'first', 'other', 'last']],
      ['|item', ['bare']],
      [':is(Item,item)', ['upper', 'bare', 'first', 'other', 'last']],
      ['item:first-of-type', ['bare', 'first', 'other']],
      ['item:last-of-type', ['bare', 'other', 'last']],
      ['item:only-of-type', ['bare', 'other']],
      ['item:nth-of-type(1)', ['bare', 'first', 'other']],
      ['item:nth-of-type(2)', ['last']],
      ['item:nth-last-of-type(1)', ['bare', 'other', 'last']],
      ['item:nth-last-of-type(2n)', ['first']],
    ])
    for (const context of [doc, doc.documentElement, fragment]) {
      for (const [selector, ids] of cases) {
        for (let repeat = 0; repeat < 2; repeat++) {
          const actual = Array.from(engine.select(selector, context))
          expect(
            actual.map(node => node.id),
            selector,
          ).toEqual(ids)
          expect(engine.first(selector, context)?.id, selector).toBe(ids[0])
          for (const node of Array.from(
            context === doc ? doc.documentElement.children : context.children,
          )) {
            expect(
              engine.match(selector, node),
              `${selector}: ${node.id}`,
            ).toBe(ids.includes(node.id))
          }
        }
      }
      for (const selector of ['s|item', 't|item', 'missing|item']) {
        expect(() => engine.select(selector, context)).toThrowError(
          expect.objectContaining({ name: 'SyntaxError' }),
        )
      }
    }
    expect(
      Array.from(engine.select('root item', doc), node => node.id),
    ).toEqual(['bare', 'first', 'other', 'last'])
    Object.defineProperty(doc, 'getElementsByTagNameNS', { value: undefined })
    expect(Array.from(engine.select('item', doc), node => node.id)).toEqual([
      'bare',
      'first',
      'other',
      'last',
    ])
  })
}

test('XML attribute namespaces preserve local names and all matching values', t => {
  const { window } = new JSDOM(
    '<r xmlns:a="urn:a" xmlns:b="urn:b"><p id="one" a:x="one" b:x="two"/><p id="two" x="two"/><p id="three" suffixx="two"/></r>',
    { contentType: 'application/xml' },
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  for (const legacy of [false, true]) {
    engine.configure({ LEGACY: legacy })
    for (const [selector, ids] of new Map([
      ['[*|x]', ['one', 'two']],
      ['[*|x="one"]', ['one']],
      ['[*|x="two"]', ['one', 'two']],
      ['[ *|x^="t"]', ['one', 'two']],
      ['[*|x$="o"]', ['one', 'two']],
      ['[*|x*="n"]', ['one']],
      ['[*|x~="two"]', ['one', 'two']],
      ['[*|x|="two"]', ['one', 'two']],
      ['[*|x="TWO" i]', ['one', 'two']],
      ['[*|x="TWO" s]', []],
      ['[*|X]', []],
      ['[|x]', ['two']],
      ['[|x="two"]', ['two']],
      ['[x]', ['two']],
    ])) {
      expect(
        Array.from(engine.select(selector), node => node.id),
        selector,
      ).toEqual(ids)
      expect(engine.first(selector)?.id, selector).toBe(ids[0])
      for (const node of window.document.documentElement.children) {
        expect(engine.match(selector, node), `${selector}: ${node.id}`).toBe(
          ids.includes(node.id),
        )
      }
    }
    expect(() => engine.select('[a|x]')).toThrowError(
      expect.objectContaining({ name: 'SyntaxError' }),
    )
  }
})

test('XML attributes without prefixes still retain their namespace', t => {
  const { window } = new JSDOM(
    '<r><p id="namespaced"/><p id="bare" x="value"/><p id="absent"/></r>',
    { contentType: 'application/xml' },
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = factory(window)
  const named = doc.getElementById('namespaced')!
  named.setAttributeNS('urn:attributes', 'x', 'value')
  for (const selector of ['[x]', '[|x]', '[x="value"]', '[|x="value"]']) {
    expect(Array.from(engine.select(selector), node => node.id)).toEqual([
      'bare',
    ])
    expect(engine.match(selector, named)).toBe(false)
  }
  expect(Array.from(engine.select('[*|x="value"]'), node => node.id)).toEqual([
    'namespaced',
    'bare',
  ])
  expect(engine.select('[missing^="n"]')).toEqual([])
  Object.defineProperty(named, 'getAttributeNS', { value: undefined })
  expect(engine.match('[x]', named)).toBe(false)
})
