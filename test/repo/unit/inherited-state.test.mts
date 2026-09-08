import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('language inheritance survives detachment and reparenting', t => {
  const { window } = new JSDOM(
    '<!doctype html><main lang="en"><i></i></main><aside lang="fr"></aside>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const main = window.document.querySelector('main')!
  const aside = window.document.querySelector('aside')!
  const child = main.firstElementChild!
  expect(engine.match(':lang(en)', child)).toBe(true)
  main.remove()
  expect(engine.match(':lang(en)', child)).toBe(true)
  aside.append(child)
  expect(engine.match(':lang(fr)', child)).toBe(true)
  expect(engine.match(':lang(en)', child)).toBe(false)
})

test('fallback directionality respects an explicit inherited direction after moves', t => {
  const { window } = new JSDOM(
    '<!doctype html><main dir="rtl"><i>English</i></main><aside dir="ltr"></aside>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  Reflect.get(engine, 'Snapshot').matchesNative = (
    _node: Element,
    _selector: string,
    fallback: boolean,
  ) => fallback
  const child = window.document.querySelector('i')!
  expect(engine.match(':dir(rtl)', child)).toBe(true)
  expect(engine.match(':dir(ltr)', child)).toBe(false)
  window.document.querySelector('aside')!.append(child)
  expect(engine.match(':dir(rtl)', child)).toBe(false)
  expect(engine.match(':dir(ltr)', child)).toBe(true)
})

test('focus-within fallback distinguishes default body state from actual focus', t => {
  const { window } = new JSDOM(
    '<!doctype html><body tabindex="0"><input></body>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const { body } = window.document
  Reflect.get(engine, 'Snapshot').matchesNative = (
    _node: Element,
    _selector: string,
    fallback: boolean,
  ) => fallback
  expect(engine.match(':focus-within', body)).toBe(false)
  body.focus()
  expect(engine.match(':focus-within', body)).toBe(true)
  body.blur()
  expect(engine.match(':focus-within', body)).toBe(false)
  window.document.querySelector('input')!.focus()
  expect(engine.match(':focus-within', body)).toBe(true)
})
