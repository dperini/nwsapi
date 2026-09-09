import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('adjacent class tests share one read without crossing compound boundaries', t => {
  const { window } = new JSDOM(
    '<!doctype html><main class="a b"><p class="a b c a:b"></p><p class="b c"></p><svg><g class="a b c"></g></svg></main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = registerLegacy(factory(window))
  const target = doc.querySelector('p')!
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const selector of [
      '.a.b.c',
      '.a\\:b.c',
      '.a.b .b.c',
      '.a.b:not(.x.y).b.c',
      '.a.b:nth-child(1)',
    ]) {
      expect(nw.select(selector, doc), selector).toEqual(
        Array.from(doc.querySelectorAll(selector)),
      )
      expect(nw.match(selector, target), selector).toBe(
        target.matches(selector),
      )
    }
    expect(nw.select('.a\\20 b.c', doc)).toEqual([])
    expect(() => nw.select('.a..b', doc)).toThrow()
  }
  nw.configure({ LEGACY: false })
  const reads = vi.spyOn(window.Element.prototype, 'className', 'get')
  expect(nw.match('.a.b.c', target)).toBe(true)
  expect(reads).toHaveBeenCalledTimes(1)
  target.className = 'a b'
  expect(nw.match('.a.b.c', target)).toBe(false)
})

test('collection class tests preserve live mutations during reentrant callbacks', t => {
  const { window } = new JSDOM(
    '<!doctype html><main><p class="a b"></p><p class="a b"></p></main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const nw = registerLegacy(factory(window))
  const nodes = Array.from(doc.querySelectorAll('p'))
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    nodes[1]!.className = 'a b'
    const run = nw.compile('.a.b', true, true)!
    const found = run(
      nodes,
      () => {
        nodes[1]!.className = 'a'
        expect(run(nodes, () => false, doc, [])).toEqual([nodes[0]])
        return false
      },
      doc,
      [],
    )
    expect(found).toEqual([nodes[0]])
    nodes[1]!.className = 'a b'
    expect(run(nodes, () => false, doc, [])).toEqual(nodes)
  }
})
