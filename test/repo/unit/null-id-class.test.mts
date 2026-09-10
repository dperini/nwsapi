import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import Adapter from '../../../dist/dom-selector.js'
import { createLegacyEngine } from '../common/legacy.mts'

// https://github.com/asamuzaK/domSelector/commit/c5b01a422d1520a7e24773cf7c45a43f4accd4e0
for (const mode of [
  'modern',
  'legacy',
  'adapter',
  'attribute-fallback',
  'xml',
]) {
  test(`${mode}: null ID and class selectors require literal attributes`, t => {
    const { window } = new JSDOM(
      '<main><div><span></span></div></main>',
      mode === 'xml' ? { contentType: 'text/xml' } : {},
    )
    t.onTestFinished(() => window.close())
    const doc = window.document
    const root = doc.querySelector('main')!
    const parent = root.firstElementChild!
    const child = parent.firstElementChild!
    if (mode === 'attribute-fallback') {
      for (const node of [root, parent, child, doc.body, doc.documentElement]) {
        Object.defineProperty(node, 'className', {
          value: undefined,
          configurable: true,
        })
      }
    }
    const engine =
      mode === 'legacy' ? createLegacyEngine(window) : factory(window)
    const adapter = new Adapter(window)
    const match = (selector: string, node: Element) =>
      mode === 'adapter'
        ? adapter.matches(selector, node)
        : engine.match(selector, node)
    const closest = (selector: string, node: Element) =>
      mode === 'adapter'
        ? adapter.closest(selector, node)
        : engine.closest(selector, node)
    for (const [selector, attribute] of [
      ['#null', 'id'],
      ['.null', 'class'],
    ] as const) {
      for (const value of [null, '', 'null', null]) {
        if (value === null) {
          child.removeAttribute(attribute)
        } else {
          child.setAttribute(attribute, value)
        }
        for (let pass = 0; pass < 2; ++pass) {
          expect(match(selector, child)).toBe(value === 'null')
          expect(closest(selector, child)).toBe(value === 'null' ? child : null)
        }
      }
      parent.setAttribute(attribute, 'null')
      expect(closest(selector, child)).toBe(parent)
      parent.removeAttribute(attribute)
      expect(closest(selector, child)).toBe(null)
    }
  })
}
