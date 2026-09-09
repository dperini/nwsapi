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
