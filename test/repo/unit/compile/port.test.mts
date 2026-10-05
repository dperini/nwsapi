import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../../dist/nwsapi.js'

test('mixed paths backtrack when the nearest ancestor cannot complete a child step', t => {
  const { window } = new JSDOM(
    '<main class="root"><div class="a">' +
      '<div class="a">'.repeat(40) +
      '<i class="leaf"></i>' +
      '</div>'.repeat(41) +
      '</main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const leaf = window.document.querySelector('i')!
  const selectors = [
    '.root > .a .a .leaf',
    '.root .a > .a .leaf',
    '.missing .a > .a .leaf',
    '.a > .a .a > .leaf',
  ]
  for (const selector of selectors) {
    expect(engine.match(selector, leaf)).toBe(leaf.matches(selector))
    expect(engine.select(selector)).toEqual(
      Array.from(window.document.querySelectorAll(selector)),
    )
  }
  window.document.querySelector('main')!.className = 'missing'
  for (const selector of selectors) {
    expect(engine.match(selector, leaf)).toBe(leaf.matches(selector))
    expect(engine.select(selector)).toEqual(
      Array.from(window.document.querySelectorAll(selector)),
    )
  }
})

test('fixed relative paths stop without constructing descendant collections', t => {
  const { window } = new JSDOM(
    '<main><section><i class="a"></i><b class="b"></b></section><section><i class="a"></i></section></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const anchor = window.document.querySelector('section')!
  const lookup = vi.spyOn(anchor, 'getElementsByTagName')
  const dispatch = vi.spyOn(engine.Snapshot, 'has')
  for (const selector of [
    ':has(> .a + .b)',
    ':has(+ section > .a)',
    ':has(~ section > .missing)',
    ':has(> .a ~ .b)',
  ]) {
    expect(engine.match(selector, anchor)).toBe(anchor.matches(selector))
  }
  expect(lookup).not.toHaveBeenCalled()
  expect(dispatch).not.toHaveBeenCalled()
  anchor.lastElementChild!.remove()
  expect(engine.match(':has(> .a + .b)', anchor)).toBe(false)
})

test('sparse has marks are scoped to each query and refresh after moving witnesses', t => {
  const { window } = new JSDOM(
    '<main>' +
      '<div class="card">'.repeat(80) +
      '<i class="witness"></i>' +
      '</div>'.repeat(80) +
      '</main>',
  )
  t.onTestFinished(() => window.close())
  const doc = window.document
  const engine = factory(window)
  const selector = '.card:has(.witness)'
  const dispatch = vi.spyOn(engine.Snapshot, 'has')
  expect(engine.select(selector)).toHaveLength(80)
  dispatch.mockClear()
  expect(engine.select(selector)).toHaveLength(80)
  expect(dispatch).not.toHaveBeenCalled()
  const scope = doc.querySelector('.card')!
  expect(engine.select(selector, scope)).toHaveLength(79)
  const witness = doc.querySelector('i')!
  scope.append(witness)
  expect(engine.select(selector)).toEqual([scope])
  const fragment = doc.createDocumentFragment()
  fragment.append(scope)
  expect(engine.select(selector, fragment)).toEqual([scope])
  witness.remove()
  expect(engine.select(selector, fragment)).toEqual([])
})

test('pure guards reject before relational work and remove exact duplicate reads', t => {
  const { window } = new JSDOM('<div class="card" data-a="one"><i></i></div>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const element = window.document.querySelector('div')!
  const attributes = vi.spyOn(element, 'hasAttribute')
  const children = vi.spyOn(element, 'firstElementChild', 'get')
  expect(engine.match('.missing[data-a]:has(> i)', element)).toBe(false)
  expect(attributes).not.toHaveBeenCalled()
  expect(children).not.toHaveBeenCalled()
  expect(engine.match('.card.card[data-a][data-a]', element)).toBe(true)
  expect(attributes).toHaveBeenCalledTimes(1)
})
