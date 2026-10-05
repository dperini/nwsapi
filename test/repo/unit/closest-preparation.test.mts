import type { EngineState } from '../../../src/core/state/types.mts'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('closest prepares once and makes one cache lookup per warm walk', t => {
  const { window } = new JSDOM('<main><div><span></span></div></main>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const state = engine as unknown as EngineState
  const originalGet = state.matchResolvers.get.bind(state.matchResolvers)
  let closestLookups = 0
  state.matchResolvers.get = (key: string) => {
    if (key === 'closest:false:.missing') {
      closestLookups++
    }
    return originalGet(key)
  }
  const span = window.document.querySelector('span')!
  const initialSize = state.matchResolvers.size()

  expect(engine.closest('.missing', span)).toBeNull()
  const preparedSize = state.matchResolvers.size()
  closestLookups = 0
  expect(engine.closest('.missing', span)).toBeNull()
  expect(closestLookups).toBe(1)
  expect(preparedSize).toBeGreaterThan(initialSize)
  expect(state.matchResolvers.size()).toBe(preparedSize)
  expect(state.matchResolvers.get('closest:false:.missing')).toHaveLength(1)
  expect(state.matchResolvers.get('false:.missing')).toBeUndefined()
})

test('closest restores document routing around a nested document query', t => {
  const source = new JSDOM('<main><div><span></span></div></main>', {
    url: 'https://source.test/',
  })
  const target = new JSDOM('<section><i></i></section>', {
    url: 'https://target.test/',
  })
  t.onTestFinished(() => {
    source.window.close()
    target.window.close()
  })
  const engine = factory(source.window)
  const div = source.window.document.querySelector('div')!
  const span = source.window.document.querySelector('span')!
  const section = target.window.document.querySelector('section')!
  let calls = 0

  expect(
    engine.closest('div', span, () => {
      calls++
      expect(engine.closest(':scope', section)).toBe(section)
    }),
  ).toBe(div)
  expect(calls).toBe(1)
  expect(engine.closest('main', div)).toBe(
    source.window.document.querySelector('main'),
  )
})

test('closest keeps XML matching rules and the starting scope', t => {
  const xml = new JSDOM('<Root><Item class="hit"><Leaf /></Item></Root>', {
    contentType: 'text/xml',
  })
  const html = new JSDOM('<main><div><span></span></div></main>')
  t.onTestFinished(() => {
    xml.window.close()
    html.window.close()
  })
  const engine = factory(html.window)
  const leaf = xml.window.document.querySelector('Leaf')!
  const span = html.window.document.querySelector('span')!

  expect(engine.closest('Item.hit', leaf)).toBe(
    xml.window.document.querySelector('Item'),
  )
  expect(engine.closest('item.hit', leaf)).toBeNull()
  expect(engine.closest(':scope', span)).toBe(span)
})

test('closest restores its starting scope after a mid-walk document switch', t => {
  const source = new JSDOM('<main><div><span></span></div></main>', {
    url: 'https://source.test/',
  })
  const target = new JSDOM('<section><i></i></section>', {
    url: 'https://target.test/',
  })
  t.onTestFinished(() => {
    source.window.close()
    target.window.close()
  })
  const engine = factory(source.window)
  const state = engine as unknown as EngineState
  const span = source.window.document.querySelector('span')!
  const targetNode = target.window.document.querySelector('i')!
  let switched = false
  Reflect.set(state.Snapshot, 'probe', (element: Element) => {
    if (element === span) {
      switched = true
      expect(engine.closest(':scope', targetNode)).toBe(targetNode)
      return false
    }
    return true
  })
  engine.registerSelector('probe', /^:probe(.*)/, (match, sourceText) => ({
    match,
    status: true,
    source: `if(s.probe(e)){${sourceText}}`,
  }))

  expect(engine.closest(':scope:probe', span)).toBeNull()
  expect(switched).toBe(true)
})

test('closest validates selectors even when the element is null', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)

  const closest = engine.closest as unknown as (
    selector: string,
    element: Element | null,
  ) => Element | null
  expect(closest(':scope', null)).toBeNull()
  expect(() => closest('??', null)).toThrow(window.DOMException)
  expect(closest(':unknown', null)).toBeNull()
  expect(
    engine.closest(
      null as unknown as string,
      window.document.querySelector('p')!,
    ),
  ).toBeNull()
})
