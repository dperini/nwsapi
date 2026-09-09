import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

for (const legacy of [false, true]) {
  test(`language ranges accept CSS strings and lists (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<main lang="en-US"><p></p><div lang="fr"></div><aside lang=""></aside></main>',
    )
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    if (legacy) {
      registerLegacy(engine).configure({ LEGACY: true })
    }
    const root = window.document.querySelector('main')!
    const p = root.firstElementChild!
    const fr = p.nextElementSibling!
    const unknown = root.lastElementChild!
    for (const selector of [
      ':lang("en")',
      ":lang('en')",
      ':lang(fr, en)',
      ':lang("en-*")',
      ':lang("*-US")',
      ':lang(\\65 n)',
    ]) {
      expect(engine.match(selector, p), selector).toBe(true)
      expect(engine.first(selector, root), selector).toBe(p)
    }
    expect(engine.select(':lang(en, fr)', root)).toEqual([p, fr])
    expect(engine.match(':lang("")', unknown)).toBe(true)
    expect(engine.match(':lang("*")', unknown)).toBe(false)
    expect(engine.match(':lang("*")', fr)).toBe(true)
    expect(engine.match(':lang("en,fr")', p)).toBe(false)
    expect(engine.match(':lang("en-123456789")', p)).toBe(false)
    for (const selector of [
      ':lang',
      ':lang()',
      ':lang(*)',
      ':lang(en-*)',
      ':lang(en,)',
      ':lang(,en)',
      ':lang("en" "fr")',
      ':lang(123)',
    ]) {
      expect(
        () => engine.select(selector, window.document.createDocumentFragment()),
        selector,
      ).toThrow()
    }
    root.setAttribute('lang', 'fr')
    expect(engine.match(':lang("en")', p)).toBe(false)
    expect(engine.match(':lang("fr")', p)).toBe(true)
  })
}
