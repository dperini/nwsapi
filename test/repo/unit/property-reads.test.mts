import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

for (const legacy of [false, true]) {
  test(`class reflections avoid unnecessary attribute reads (legacy=${legacy})`, t => {
    const { window } = new JSDOM('')
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    if (legacy) {
      registerLegacy(engine)
    }
    engine.configure({ LEGACY: legacy })
    const resolver = engine.compile('.item', false)!
    for (const className of ['item', { baseVal: 'item' }] as const) {
      const target = {
        nodeType: 1,
        className,
        getAttribute() {
          throw Error('Unnecessary attribute read')
        },
      }
      expect(resolver(target, undefined, undefined, false)).toBe(true)
    }
    let reads = 0
    const target = {
      nodeType: 1,
      getAttribute(name: string) {
        expect(name).toBe('class')
        reads++
        return 'item'
      },
    }
    expect(resolver(target, undefined, undefined, false)).toBe(true)
    expect(reads).toBe(1)
  })

  test(`ID comparisons preserve escaped punctuation (legacy=${legacy})`, t => {
    const { window } = new JSDOM('')
    t.onTestFinished(() => window.close())
    const engine = factory(window)
    if (legacy) {
      registerLegacy(engine)
    }
    engine.configure({ LEGACY: legacy })
    for (const [id, selector] of [
      ['a.b', '#a\\.b'],
      ['a$b', '#a\\$b'],
      ['a"b', '#a\\22 b'],
      ['a"b', '#a\\"b'],
      ['a\\b', '#a\\5c b'],
    ] as const) {
      const target = {
        id,
        getAttribute() {
          throw Error('Unnecessary attribute read')
        },
      }
      const resolver = engine.compile(selector!, false)!
      expect(resolver(target, undefined, undefined, false)).toBe(true)
      target.id += 'suffix'
      expect(resolver(target, undefined, undefined, false)).toBe(false)
    }
  })
}
