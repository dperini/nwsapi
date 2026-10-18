import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { nthFiltered } from '../../../../../src/core/compile/position/filtered.mts'
import type {
  EngineState,
  FilteredNthState,
} from '../../../../../src/core/state/types.mts'

test('excluded simple-type candidates skip sibling traversal', () => {
  const engine = {
    HTML_DOCUMENT: true,
    Config: { LEGACY: false },
    NAMESPACE: 'html',
    asciiLower: (value: string) => value.toLowerCase(),
    tagOf: (element: Element) => element.localName,
  } as unknown as EngineState
  const parent = {
    get firstElementChild() {
      throw new Error('excluded candidates must not traverse siblings')
    },
  } as unknown as ParentNode
  const candidate = {
    parentNode: parent,
    namespaceURI: 'html',
    localName: 'span',
  } as Element
  const state: FilteredNthState = {}

  expect(nthFiltered(engine, candidate, 'button, input', false, state)).toBe(0)
  expect(state.parent).toBeUndefined()
  expect(state.parents).toBeUndefined()
})

test('simple-type positions preserve forward, reverse, cached and fresh state', t => {
  const { window } = new JSDOM(
    '<main><button id="first"></button><span id="skip"></span><input id="second"><button id="third"></button></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = createEngine()
  const main = window.document.querySelector('main')!
  const first = main.children[0]!
  const skipped = main.children[1]!
  const second = main.children[2]!
  const third = main.children[3]!
  const state: FilteredNthState = {}

  expect(nthFiltered(engine, skipped, 'button, input', false, state)).toBe(0)
  expect(nthFiltered(engine, first, 'button, input', false, state)).toBe(1)
  expect(nthFiltered(engine, second, 'button, input', false, state)).toBe(2)
  expect(nthFiltered(engine, third, 'button, input', true, state)).toBe(1)
  expect(state.parents?.get(main)?.nodes).toEqual([first, second, third])
  expect(nthFiltered(engine, second, 'button, input', false, null)).toBe(2)

  first.remove()
  expect(nthFiltered(engine, second, 'button, input', false, null)).toBe(1)
  const freshState: FilteredNthState = {}
  expect(nthFiltered(engine, third, 'button, input', true, freshState)).toBe(1)
})

function createEngine() {
  return {
    HTML_DOCUMENT: true,
    Config: { LEGACY: false },
    NAMESPACE: 'http://www.w3.org/1999/xhtml',
    asciiLower: (value: string) => value.toLowerCase(),
    tagOf: (element: Element) => element.localName,
    primordials: { WeakMapCtor: WeakMap },
    createWeakMap: () => new WeakMap(),
    firstOf: (parent: ParentNode) => parent.firstElementChild,
    nextOf: (element: Element) => element.nextElementSibling,
  } as unknown as EngineState
}
