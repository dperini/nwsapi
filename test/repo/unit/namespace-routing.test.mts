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
