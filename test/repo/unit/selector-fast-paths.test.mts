import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

for (const legacy of [false, true]) {
  test(`logical type tests preserve context and mutations (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<!doctype html><div id="a"><!-- comment --><button></button></div><div id="b"><span><button></button></span></div><input>',
    )
    t.onTestFinished(() => window.close())
    const nw = factory(window)
    nw.configure({ LEGACY: legacy })
    const { document } = window
    const a = document.getElementById('a')!
    const b = document.getElementById('b')!
    for (const selector of [
      ':is(button, input)',
      ':where(button,input)',
      'div:has(> button)',
      'div:has(> *)',
      'div:not(:has(> button))',
      'div:has(> button) + div',
    ]) {
      expect(nw.select(selector, document), selector).toEqual(
        Array.from(document.querySelectorAll(selector)),
      )
      for (const element of document.querySelectorAll('*')) {
        expect(nw.match(selector, element), selector).toBe(
          element.matches(selector),
        )
      }
    }
    expect(nw.select('div:has(> button)', document)).toEqual([a])
    b.append(a.querySelector('button')!)
    expect(nw.select('div:has(> button)', document)).toEqual([b])
    const fragment = document.createDocumentFragment()
    fragment.append(b)
    expect(nw.select('div:has(> button)', fragment)).toEqual([b])
    expect(() => nw.select('div:has(> button, :unknown)', fragment)).toThrow()
    expect(nw.select(':is(button, :unknown)', fragment)).toEqual(
      Array.from(fragment.querySelectorAll('button')),
    )
  })
}

for (const doctype of ['<!doctype html>', '']) {
  test(`class token candidates retain exact attribute matching (${doctype || 'quirks'})`, t => {
    const { window } = new JSDOM(
      doctype +
        '<p class="primary" id="a"></p><p class="PRIMARY" id="b"></p><p class="x\u00a0primary" id="c"></p><svg><g class="primary" id="d"></g></svg>',
    )
    t.onTestFinished(() => window.close())
    const nw = factory(window)
    const { document } = window
    for (const selector of [
      '[class~="primary"]',
      '[class~=primary]',
      '[class~="PRIMARY"]',
      '[class~="primary" i]',
      '[class~="pri\\6d ary"]',
      '[class~="null"]',
      '[class~=""]',
      '[class~="two words"]',
      '[class~="two\\9 words"]',
    ]) {
      const expected = Array.from(document.querySelectorAll(selector))
      expect(nw.select(selector, document), selector).toEqual(expected)
      expect(nw.select(selector, document), selector).toEqual(expected)
      for (const element of document.querySelectorAll('*')) {
        expect(nw.match(selector, element), selector).toBe(
          expected.includes(element),
        )
      }
    }
    const a = document.getElementById('a')!
    a.className = 'gone'
    expect(nw.select('[class~="primary"]', document).map(e => e.id)).toEqual([
      'd',
    ])
    const fragment = document.createDocumentFragment()
    a.className = 'primary'
    fragment.append(a)
    expect(nw.select('[class~="primary"]', fragment)).toEqual([a])
  })
}

test('logical type tests preserve XML case and empty contexts', t => {
  const { window } = new JSDOM(
    '<root><box><button/></box><box><Button/></box></root>',
    { contentType: 'application/xml' },
  )
  t.onTestFinished(() => window.close())
  const nw = factory(window)
  for (const selector of [
    ':is(button,input)',
    'box:has(> button)',
    'box:has(> *)',
  ]) {
    expect(nw.select(selector, window.document)).toEqual(
      Array.from(window.document.querySelectorAll(selector)),
    )
    expect(
      nw.select(selector, window.document.createDocumentFragment()),
    ).toEqual([])
  }
})
