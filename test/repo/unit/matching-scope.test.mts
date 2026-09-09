import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

for (const legacy of [false, true]) {
  test(`matching scope uses subject identity (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<main><div class="same"><div class="same"><span></span></div></div></main>',
    )
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    if (legacy) {
      registerLegacy(engine).configure({ LEGACY: true })
    }
    const outer = window.document.querySelector('main > div')!
    const inner = outer.firstElementChild!
    for (let pass = 0; pass < 2; pass++) {
      engine.select('div', window.document)
      expect(engine.match(':scope', inner)).toBe(true)
      expect(engine.match(':is(:scope)', inner)).toBe(true)
      expect(engine.match(':not(:scope)', inner)).toBe(false)
      expect(engine.match(':scope > span', inner.firstElementChild!)).toBe(
        false,
      )
      expect(engine.closest(':scope > .same', inner)).toBeNull()
      expect(engine.closest(':scope', inner)).toBe(inner)
      expect(engine.select(':scope > .same', outer)).toEqual([inner])
      expect(engine.select(':is(:scope) > .same', outer)).toEqual([inner])
    }
    const previous = engine.Snapshot.from
    expect(() => engine.match(':unknown', inner)).toThrow()
    expect(engine.Snapshot.from).toBe(previous)
    expect(
      engine.match(':scope', inner, () => {
        expect(engine.match(':scope', outer)).toBe(true)
      }),
    ).toBe(true)
    expect(engine.Snapshot.from).toBe(previous)
  })
}
