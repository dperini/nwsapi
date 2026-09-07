import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

for (const [value, identifier] of [
  ['a,b', 'a\\2c b'],
  ['a,b', 'a\\00002c b'],
  ['a.b', 'a\\.b'],
  ['a.b', 'a\\2e b'],
  ['a/b', 'a\\2f b'],
  ['a[b', 'a\\5b b'],
  ['a(b', 'a\\28 b'],
  ['a+b', 'a\\2b b'],
  ['a\\b', 'a\\5c b'],
  ['a\ufffdb', 'a\\0 b'],
  ['a\u{1f4a9}b', 'a\\1f4a9 b'],
]) {
  for (const attribute of ['id', 'class']) {
    test(`${attribute} escape ${identifier} survives compilation and mutation`, t => {
      const dom = new JSDOM('<!doctype html><p></p><p></p>')
      t.onTestFinished(() => dom.window.close())
      const document = dom.window.document
      const [node, other] = document.getElementsByTagName('p')
      const engine = factory(dom.window)
      const selector = 'p' + (attribute === 'id' ? '#' : '.') + identifier
      other.setAttribute(attribute, 'axb')
      for (const current of [value, 'different', value]) {
        node.setAttribute(attribute, current)
        const expected = current === value
        expect(engine.match(selector, node)).toBe(expected)
        expect(engine.match(selector, other)).toBe(false)
        expect(engine.select(selector, document)).toEqual(
          expected ? [node] : [],
        )
        expect(engine.first(selector, document)).toBe(expected ? node : null)
        expect(engine.match(':is(' + selector + ')', node)).toBe(expected)
      }
    })
  }
}

for (const [value, identifier] of [
  ['a b', 'a\\20 b'],
  ['a\tb', 'a\\9 b'],
  ['a\nb', 'a\\a b'],
  ['a\fb', 'a\\c b'],
  ['a\rb', 'a\\d b'],
]) {
  test(`escaped whitespace ${identifier} matches IDs, not class tokens`, t => {
    const dom = new JSDOM('<!doctype html><p></p>')
    t.onTestFinished(() => dom.window.close())
    const document = dom.window.document
    const node = document.querySelector('p')!
    const engine = factory(dom.window)
    node.id = value
    node.className = value
    for (const prefix of ['#', '.']) {
      for (const selector of [
        prefix + identifier,
        'p' + prefix + identifier,
        ':is(' + prefix + identifier + ')',
      ]) {
        const expected = prefix === '#'
        expect(engine.match(selector, node)).toBe(expected)
        expect(engine.select(selector, document)).toEqual(
          expected ? [node] : [],
        )
        expect(engine.first(selector, document)).toBe(expected ? node : null)
      }
    }
  })
}
