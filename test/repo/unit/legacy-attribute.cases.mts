import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'
import type factory from '../../../dist/nwsapi.js'
import { registerLegacy, registerLegacyInContext } from '../common/legacy.mts'
import {
  build,
  engineFactory,
  ids,
  MARKUP,
  nwsapiPath,
  SELECTORS,
  windows,
} from './legacy-fixture.mts'

describe('the attribute quirks that host had', () => {
  // The subject of jQuery's attr/prop split and of David Mark's My-Library:
  // getAttribute answered through the DOM property, so what came back was
  // not always the markup a selector compares against.
  test('a URL attribute compares as markup, not as the resolved URL', () => {
    const { NW, host } = build(MARKUP)
    const link = host.getElementById('a1')!

    // what this host answers without the flag, which is not what the
    // selector is asking about
    expect(link!.getAttribute('href')).toBe('http://legacy.example/go')
    expect(
      Reflect.apply(Reflect.get(link!, 'getAttribute'), link, ['href', 2]),
    ).toBe('./go')

    expect(ids(NW.select('a[href="./go"]', host))).toEqual(['a1'])
    expect(ids(NW.select('a[href^="./"]', host))).toEqual(['a1'])
    expect(ids(NW.select('a[href="http://legacy.example/go"]', host))).toEqual(
      [],
    )
  })

  test('class and for are read through the property that host exposed', () => {
    const { NW, host } = build(MARKUP)
    const link = host.getElementById('a1')!

    // the markup name answered nothing at all
    expect(link!.getAttribute('for')).toBeNull()
    expect(Reflect.get(link!, 'htmlFor')).toBe('x')
    expect(host.getElementById('d1')!.getAttribute('class')).toBeNull()
    expect(host.getElementById('d1')!.className).toBe('box wide')

    expect(ids(NW.select('.box', host))).toEqual(['d1', 'd2'])
    expect(ids(NW.select('[class~="wide"]', host))).toEqual(['d1'])
    expect(ids(NW.select('[for="x"]', host))).toEqual(['a1'])
  })

  test('a boolean attribute reads as the markup of the bare form', () => {
    // The host answers the property, so '<input checked>' and
    // '<input checked="checked">' are indistinguishable. Mark settles that
    // by reporting the empty string, which is the markup of the bare form,
    // and this engine does the same: the presence test works either way and
    // the value test agrees with the reference engine on the bare form.
    const { NW, host, document } = build(MARKUP)
    expect(host.getElementById('i1')!.getAttribute('checked')!).toBe(true)

    expect(ids(NW.select('input[checked]', host))).toEqual(['i1'])
    expect(ids(NW.select('input[disabled]', host))).toEqual(['i2'])

    for (const selector of [
      'input[checked]',
      'input[checked=""]',
      'input[checked="checked"]',
    ] as const) {
      expect(ids(NW.select(selector, host)), selector).toEqual(
        ids(document.querySelectorAll(selector)),
      )
    }
  })

  test('a property default is not an attribute', () => {
    // IE 6 and 7 answered getAttribute('enctype') with the form default when
    // the markup had set nothing, so a value cannot decide presence.
    const { NW, host, document } = build(MARKUP)
    const form = host.getElementById('f1')!
    expect(form!.getAttribute('enctype')).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(form!.attributes.getNamedItem('enctype')).toBeNull()

    expect(ids(NW.select('form[enctype]', host))).toEqual([])
    expect(ids(document.querySelectorAll('form[enctype]'))).toEqual([])
    expect(NW.match('[enctype]', form)).toBe(false)
  })

  test('a host with no way to ask for the markup of a URL', () => {
    // Opera up to 9.27 resolved a form action and took no second argument,
    // so the read that answers the markup is detected rather than assumed.
    const { NW, host, document } = build(MARKUP, { urls: 'plain' })
    const link = host.getElementById('a1')!
    expect(link!.getAttribute('href')).toBe('http://legacy.example/go')
    expect(
      Reflect.apply(Reflect.get(link!, 'getAttribute'), link, ['href', 2]),
    ).toBe('http://legacy.example/go')

    for (const selector of [
      'a[href="./go"]',
      'a[href^="./"]',
      'a[href]',
    ] as const) {
      expect(ids(NW.select(selector, host)), selector).toEqual(
        ids(document.querySelectorAll(selector)),
      )
    }
  })

  test('a style attribute is a presence test, not an object stringified', () => {
    const { NW, host } = build(MARKUP)
    expect(typeof host.getElementById('d3')!.getAttribute('style')!).toBe(
      'object',
    )
    expect(ids(NW.select('div[style]', host))).toEqual(['d3'])
  })

  test('an attribute the markup never set is absent', () => {
    const { NW, host } = build(MARKUP)
    expect(ids(NW.select('[data-missing]', host))).toEqual([])
    expect(ids(NW.select('input[readonly]', host))).toEqual([])
    expect(NW.match('[data-missing]', host.getElementById('d1')!)).toBe(false)
  })
})

describe('what LEGACY does to a host that does not need it', () => {
  test('explicit legacy handling works without WeakMap and survives document changes', () => {
    const first = new JSDOM(MARKUP),
      second = new JSDOM(MARKUP)
    try {
      const context = {
        module: { exports: {} as typeof factory },
        exports: {},
        WeakMap: undefined,
      }
      vm.runInNewContext(readFileSync(nwsapiPath, 'utf8'), context)
      const NW = registerLegacyInContext(
        context.module.exports(first.window),
        context,
      )
      expect(NW.Config['LEGACY']).toBe(false)
      NW.configure({ LEGACY: true })
      expect(NW.Config['LEGACY']).toBe(true)
      for (const dom of [first, second, first] as const) {
        expect(ids(NW.select('div.box > p.a', dom.window.document))).toEqual(
          ids(dom.window.document.querySelectorAll('div.box > p.a')),
        )
        expect(NW.Config['LEGACY']).toBe(true)
      }
    } finally {
      first.window.close()
      second.window.close()
    }
  })

  test('the same answers, with the handling forced on', () => {
    const dom = new JSDOM(MARKUP)
    windows.push(dom.window)
    const { document } = dom.window
    const NW = registerLegacy(
      engineFactory({
        document,
        DOMException: dom.window.DOMException,
      }),
    )
    expect(NW.configure()['LEGACY'], 'not detected on a modern host').toBe(
      false,
    )

    const modern = SELECTORS.map(selector => ids(NW.select(selector, document)))
    NW.configure({ LEGACY: true })
    expect(NW.configure()['LEGACY']).toBe(true)
    const legacy = SELECTORS.map(selector => ids(NW.select(selector, document)))
    NW.configure({ LEGACY: false })

    for (let i = 0; i < SELECTORS.length; ++i) {
      expect(legacy[i], SELECTORS[i]).toEqual(modern[i])
      expect(modern[i], SELECTORS[i]).toEqual(
        ids(document.querySelectorAll(SELECTORS[i]!)),
      )
    }
  })
})
