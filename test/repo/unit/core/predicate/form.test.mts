import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../../../dist/nwsapi.js'

test('issue 259 ignores the default body activeElement when nothing has focus', t => {
  const { window } = new JSDOM('<!doctype html><input><button>Focus</button>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const snapshot = Reflect.get(engine, 'Snapshot')
  const { document } = window
  let focused: Element | null = null
  document.hasFocus = () => true
  snapshot.matchesNative = (
    node: Element,
    selector: string,
    fallback: boolean | undefined,
  ) => (selector === ':focus' ? node === focused : fallback)

  for (const selector of [
    ':focus',
    ':focus-visible',
    ':focus-within',
    ':active',
  ]) {
    expect(engine.select(selector, document), selector).toEqual([])
  }

  const input = document.querySelector('input')!
  input.focus()
  focused = input
  for (const selector of [':focus', ':focus-visible', ':active']) {
    expect(engine.select(selector, document), selector).toContain(input)
  }
  expect(engine.select(':focus-within', document)).toContain(document.body)

  const body = document.body
  body.tabIndex = 0
  body.focus()
  focused = body
  for (const selector of [
    ':focus',
    ':focus-visible',
    ':focus-within',
    ':active',
  ]) {
    expect(engine.select(selector, document), selector).toContain(body)
  }
})
