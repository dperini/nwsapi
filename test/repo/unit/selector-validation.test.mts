import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('pseudo-element validation survives empty contexts and candidate optimizations', t => {
  const { window } = new JSDOM('<p class="a" id="b"></p>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = factory(window)
  const element = doc.querySelector('p')!
  for (const selector of [
    '::before::marker',
    '::cue-region(:lang(en))',
    '::cue(.spoken)',
    '::part(--)',
    '::part(tab):hover',
    '::slotted(.a)::before',
    '::view-transition-group(foo.bar)',
    'p::marker',
  ]) {
    expect(engine.select(selector, doc), selector).toEqual([])
    expect(engine.match(selector, element), selector).toBe(false)
  }
  for (const selector of [
    '::cue(::before)',
    '::cue(:unknown)',
    '::cue(.a .b)',
    '::part(tab):has(.a)::before',
    '::part(tab):is',
    '::part(tab)#b',
    '::selection:hover',
    '::slotted(*).a',
    '::view-transition-group(foo.)',
    '::view-transition-group(foo.0)',
    ':host(:not(.a .b))',
    ':is(p])',
    ':not(::before)',
    ':state(0)',
    ':state(0rem)',
    ':where(p})',
    'p::before > .a',
  ]) {
    expect(() => engine.select(selector, doc), selector).toThrow()
    expect(
      () => engine.first(selector, doc.createDocumentFragment()),
      selector,
    ).toThrow()
    expect(() => engine.match(selector, element), selector).toThrow()
  }
  // The compiler also accepts the existing synthetic pseudo-element candidates.
  const resolver = engine.compile('::before', false)!
  expect(resolver({ element, type: '::before' }, null, null, false)).toBe(true)
  expect(resolver({ element, type: '::after' }, null, null, false)).toBe(false)
})

test('attribute defaults follow each element namespace and document after cache reuse', t => {
  const { window } = new JSDOM('<input type="TEXT">')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const html = doc.querySelector('input')!
  const foreign = doc.createElementNS('urn:other', 'input')
  foreign.setAttribute('type', 'TEXT')
  const xml = new window.DOMParser().parseFromString(
    '<input type="TEXT"/>',
    'application/xml',
  ).documentElement
  const engine = factory(window)
  for (const element of [html, foreign, xml, html, xml, foreign]) {
    expect(engine.match('[type=text]', element)).toBe(element === html)
    expect(engine.match('[type=text i]', element)).toBe(true)
    expect(engine.match('[type=text s]', element)).toBe(false)
  }
})

test('language matching honors namespace inheritance, subtag limits, and mutations', t => {
  const { window } = new JSDOM('<main lang="de-Latn-DE"><p></p></main>')
  t.onTestFinished(() => window.close())
  const doc = window.document
  const main = doc.querySelector('main')!
  const element = main.firstElementChild!
  const engine = factory(window)
  expect(engine.match(':lang(de-DE)', element)).toBe(true)
  main.lang = 'de-x-DE'
  expect(engine.match(':lang(de-DE)', element)).toBe(false)
  main.lang = 'fr-ninechars'
  expect(engine.match(':lang(fr)', element)).toBe(false)
  main.lang = 'en-US'
  expect(engine.match(':lang(us)', element)).toBe(false)
  element.setAttributeNS(
    'http://www.w3.org/XML/1998/namespace',
    'xml:lang',
    'fr',
  )
  expect(engine.match(':lang(fr)', element)).toBe(true)
  element.setAttribute('lang', 'en')
  expect(engine.match(':lang(en)', element)).toBe(false)
  element.removeAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')
  expect(engine.match(':lang(en)', element)).toBe(true)
})
