import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

test('class matching uses HTML and SVG reflections before reading attributes', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const resolver = engine.compile('.item', false)!
  for (const className of ['item', { baseVal: 'item' }] as const) {
    const target = {
      className,
      getAttribute() {
        throw Error('Unnecessary attribute read')
      },
    }
    expect(resolver(target, undefined, undefined, false)).toBe(true)
  }
  let reads = 0
  const target = {
    getAttribute(name: string) {
      expect(name).toBe('class')
      reads++
      return 'item'
    },
  }
  expect(resolver(target, undefined, undefined, false)).toBe(true)
  expect(reads).toBe(1)
})

test('ID comparisons preserve escaped punctuation without attribute calls', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
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
