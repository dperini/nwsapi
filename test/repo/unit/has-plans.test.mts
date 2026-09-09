import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('has plans stop at existence and keep sibling, filtered, and mutation results live', t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' +
      '<section><i data-hit></i><i data-hit></i><i data-hit></i></section>'.repeat(
        12,
      ) +
      '</main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = registerLegacy(factory(window))
  const sections = Array.from(doc.getElementsByTagName('section'))
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const selector of [
      'section:has([data-hit])',
      'section:has(> [data-hit])',
      'section:has(+ section)',
      'section:has(~ section)',
      'section:has(.missing, [data-hit])',
      'section:has([data-hit], .missing)',
      'section:has(i:nth-child(2 of [data-hit]))',
    ]) {
      expect(nw.select(selector, doc), selector).toEqual(
        Array.from(doc.querySelectorAll(selector)),
      )
      expect(nw.first(selector, doc), selector).toBe(
        doc.querySelector(selector),
      )
    }
    const anchor = sections[0]!
    anchor.replaceChildren()
    expect(nw.match('section:has([data-hit])', anchor)).toBe(false)
    const child = doc.createElement('i')
    child.setAttribute('data-hit', '')
    anchor.append(child)
    expect(nw.match('section:has([data-hit])', anchor)).toBe(true)
    expect(nw.Snapshot.has(['[data-hit]', '.missing'], anchor)).toBe(true)
    expect(() => nw.Snapshot.has(['[data-hit]', ':unknown'], anchor)).toThrow()
    expect(nw.Snapshot.has(['+ section'], doc.createElement('section'))).toBe(
      false,
    )
  }
  nw.configure({ LEGACY: false })
  const reads = vi.spyOn(window.Element.prototype, 'hasAttribute')
  expect(nw.select('section:has([data-hit])', doc)).toEqual(sections)
  expect(reads.mock.calls.filter(args => args[0] === 'data-hit')).toHaveLength(
    12,
  )
})

test('has plans are discarded when document or selector configuration changes', t => {
  const html = new JSDOM('<!doctype html><main><p class="hit"></p></main>')
  const xml = new JSDOM('<root><main><P class="hit"/></main></root>', {
    contentType: 'application/xml',
  })
  t.onTestFinished(() => {
    html.window.close()
    xml.window.close()
  })
  const nw = registerLegacy(factory(html.window))
  const selector = 'main:has(p.hit)'
  for (const legacy of [false, true, false]) {
    nw.configure({ LEGACY: legacy })
    expect(nw.select(selector, html.window.document)).toHaveLength(1)
    expect(nw.select(selector, xml.window.document)).toHaveLength(0)
  }
  nw.configure({ FORGIVING: true })
  expect(
    nw.select('main:has(:is(:unknown, .hit))', html.window.document),
  ).toHaveLength(1)
  nw.configure({ FORGIVING: false })
  expect(() =>
    nw.select('main:has(:is(:unknown, .hit))', html.window.document),
  ).toThrow()
})

test('sibling descendant plans narrow lookup roots without changing scope or sibling chains', t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' +
      '<section><p data-hit></p><p></p></section>'.repeat(8) +
      '</main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = registerLegacy(factory(window))
  const parent = doc.querySelector('main')!
  const sections = Array.from(doc.getElementsByTagName('section'))
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const selector of [
      'section:has(+ section [data-hit])',
      'section:has(+ section > p:nth-child(2))',
      'section:has(+ section + section [data-hit])',
      'section:has(+ section ~ section [data-hit])',
      'section:has(+ section :is([data-hit], .missing))',
      'section:has(~ section [data-hit])',
      'section:has(~ section :not([data-hit]))',
    ]) {
      expect(nw.select(selector, doc), selector).toEqual(
        Array.from(doc.querySelectorAll(selector)),
      )
    }
  }
  nw.configure({ LEGACY: false })
  const reads = vi.spyOn(parent, 'getElementsByTagName')
  expect(nw.select('section:has(+ section [data-hit])', doc)).toEqual(
    sections.slice(0, -1),
  )
  expect(reads).not.toHaveBeenCalled()
  sections[1]!.replaceChildren()
  const emptyReads = vi.spyOn(sections[1]!, 'getElementsByTagName')
  expect(nw.match('section:has(+ section [data-hit])', sections[0]!)).toBe(
    false,
  )
  expect(emptyReads).not.toHaveBeenCalled()
  expect(nw.match('section:has(~ section [data-hit])', sections[0]!)).toBe(true)
  sections[1]!.remove()
  expect(nw.match('section:has(+ section [data-hit])', sections[0]!)).toBe(true)
})

test('internal has snapshots remain private and refresh after mutation', t => {
  const { window } = new JSDOM(
    '<!doctype html><section>' +
      '<p class="hit"></p>'.repeat(24) +
      '</section>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = factory(window)
  const anchor = doc.querySelector('section')!
  const selector = 'section:has(p.hit[data-hit])'
  expect(nw.match(selector, anchor)).toBe(false)
  const last = anchor.lastElementChild!
  last.setAttribute('data-hit', '')
  expect(nw.match(selector, anchor)).toBe(true)
  const exposed = nw.byClass('hit', anchor)
  Array.prototype.splice.call(exposed, 0, exposed.length)
  expect(nw.match(selector, anchor)).toBe(true)
  last.className = ''
  expect(nw.match(selector, anchor)).toBe(false)
  last.className = 'hit'
  expect(nw.match(selector, anchor)).toBe(true)
  last.remove()
  expect(nw.match(selector, anchor)).toBe(false)
})
