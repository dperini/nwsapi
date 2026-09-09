import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('first ID queries preserve duplicates, root scopes, syntax, and mutations', t => {
  const { window } = new JSDOM('<!doctype html><div id="outside"></div>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const host = doc.createElement('section')
  doc.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const fragment = doc.createDocumentFragment()
  const nw = registerLegacy(factory(window))
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const context of [doc.body, shadow, fragment]) {
      if (context === shadow) {
        doc.body.append(host)
      }
      context.append(
        ...JSDOM.fragment(
          '<p id="target"></p><b id="target"></b><i id=""></i><i id="a:b"></i><i id="123"></i>',
        ).childNodes,
      )
      const root = context === doc.body ? doc : context
      for (const selector of [
        '#target',
        '#missing',
        '#a\\:b',
        '[id="target"]',
        "[id='target']",
        '[id=target]',
        '[id="123"]',
        '[id=""]',
        '[id="missing"]',
        '[id="a\\:b"]',
        '[id="TARGET" i]',
        '[id="target"]:not(p)',
        '[id="target"], #outside',
      ]) {
        expect(nw.first(selector, root), selector).toBe(
          root.querySelector(selector),
        )
        expect(nw.select(selector, root), selector).toEqual(
          Array.from(root.querySelectorAll(selector)),
        )
      }
      for (const selector of [
        '[id="target"]!',
        '[id=123]',
        '[id="target"]:unknown',
      ]) {
        expect(() => nw.first(selector, root), selector).toThrow()
      }
      const first = root.querySelector('#target')!
      const seen: Element[] = []
      expect(
        nw.first('[id="target"]', root, element => {
          seen.push(element)
          element.remove()
        }),
      ).toBe(first)
      expect(seen).toEqual([first])
      expect(nw.first('[id="target"]', root)?.localName).toBe('b')
      context.replaceChildren()
    }
  }
})

test('root ID shortcuts avoid scans without borrowing an element scope ID map', t => {
  const { window } = new JSDOM(
    '<!doctype html><p id="target"></p><main><b id="target"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = factory(window)
  const main = doc.querySelector('main')!
  expect(nw.first('[id="target"]', main)).toBe(main.firstElementChild)
  expect(nw.first('#missing', main)).toBeNull()
  const shadow = doc.createElement('section').attachShadow({ mode: 'open' })
  doc.body.append(shadow.host)
  shadow.innerHTML = '<div><p id="shadow-only"></p><p id="target"></p></div>'
  const inner = shadow.firstElementChild!
  expect(nw.first('#shadow-only', inner)).toBe(inner.firstElementChild)
  expect(nw.select('#shadow-only', inner)).toEqual([inner.firstElementChild])
  for (const root of [doc, shadow]) {
    const native = root.getElementById.bind(root)
    let lookups = 0
    root.getElementById = id => {
      ++lookups
      return native(id)
    }
    for (const selector of ['#target', '[id="target"]']) {
      lookups = 0
      expect(nw.first(selector, root)).toBe(native('target'))
      expect(lookups).toBe(1)
    }
  }
  expect(nw.first('[id="target"]')).toBe(doc.querySelector('p'))
})

test('ID attribute queries retain XML case and hosts without ID lookup', t => {
  const xml = new JSDOM('<root><p ID="target"/><b id="target"/></root>', {
    contentType: 'application/xml',
  })
  const html = new JSDOM('<!doctype html><p id="target"></p>')
  t.onTestFinished(() => {
    xml.window.close()
    html.window.close()
  })
  const nw = factory(html.window)
  expect(nw.first('[id="target"]', xml.window.document)?.localName).toBe('b')
  expect(nw.first('[id="target"]', html.window.document)?.localName).toBe('p')
  expect(nw.first('[id="target"]')?.localName).toBe('p')
  const fragment = html.window.document.createDocumentFragment()
  fragment.append(html.window.document.querySelector('p')!)
  Object.defineProperty(fragment, 'getElementById', { value: undefined })
  expect(nw.first('[id="target"]', fragment)).toBe(fragment.firstElementChild)
})
