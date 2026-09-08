import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('first-token queries preserve scopes, mutations, callbacks, and fallback syntax', t => {
  const { window } = new JSDOM(
    '<!doctype html><main class="card"><span class="primary" id="wrong"></span><button class="primary" id="a"></button><button class="primary" id="b"></button><svg><g class="primary" id="svg"></g></svg></main>',
  )
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  const doc = window.document
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const context of [doc, doc.querySelector('main')!]) {
      for (const selector of [
        '*',
        '.card',
        'button',
        'button.primary',
        '*.primary',
        '.missing',
        'input.primary',
        'g.primary',
        'button:not(.missing)',
        '.pr\\69 mary',
      ]) {
        expect(nw.first(selector, context), selector).toBe(
          context.querySelector(selector),
        )
      }
    }
  }
  nw.configure({ LEGACY: false })
  const first = doc.getElementById('a')!
  const seen: Element[] = []
  expect(
    nw.first('button.primary', doc, e => {
      seen.push(e)
      e.remove()
    }),
  ).toBe(first)
  expect(seen).toEqual([first])
  expect(nw.first('button.primary', doc)).toBe(doc.getElementById('b'))
  const fragment = doc.createDocumentFragment()
  fragment.append(doc.getElementById('b')!)
  expect(nw.first('button.primary', fragment)).toBe(fragment.firstElementChild)
  expect(nw.first('button.primary', doc)).toBeNull()
  expect(() => nw.first('button..primary', doc)).toThrow()
})

test('first-token queries update document state and preserve XML and quirks case', t => {
  const html = new JSDOM('<!doctype html><p class="x" id="html"></p>')
  const xml = new JSDOM(
    '<root><P class="x" id="upper"/><p class="x" id="lower"/></root>',
    { contentType: 'application/xml' },
  )
  const quirks = new JSDOM('<p class="X" id="quirks"></p>')
  t.onTestFinished(() => {
    html.window.close()
    xml.window.close()
    quirks.window.close()
  })
  const nw = factory(html.window)
  expect(nw.first('.x', html.window.document)!.id).toBe('html')
  expect(nw.first('P.x', xml.window.document)!.id).toBe('upper')
  expect(nw.first('p.x')!.id).toBe('lower')
  expect(nw.first('p.x', quirks.window.document)!.id).toBe('quirks')
  expect(nw.first('p.x', html.window.document)!.id).toBe('html')
})
