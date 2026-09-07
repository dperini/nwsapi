import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../src/nwsapi.js'

for (const pseudo of [
  'nth-child',
  'nth-last-child',
  'nth-of-type',
  'nth-last-of-type',
]) {
  test(`${pseudo} preserves constant and formula results after mutations`, t => {
    const { window } = new JSDOM(
      '<main><i></i>text<!-- gap --><b></b><i></i><i></i></main>',
      {
        url: 'https://example.test/',
      },
    )
    t.onTestFinished(() => window.close())
    const { document } = window
    const engine = factory(window)
    const parent = document.querySelector('main')!
    for (let round = 0; round < 3; round++) {
      for (const index of [
        '0',
        '-1',
        '1',
        '2',
        '3',
        '4',
        '5',
        '0n+3',
        '2n',
        'n+3',
      ]) {
        const selector = `:${pseudo}(${index})`
        const elements = [...parent.children]
        const expected = elements.filter(element => {
          const siblings = pseudo.includes('of-type')
            ? elements.filter(
                sibling => sibling.localName === element.localName,
              )
            : elements
          const position = pseudo.includes('last')
            ? siblings.length - siblings.indexOf(element)
            : siblings.indexOf(element) + 1
          return index === '2n'
            ? position % 2 === 0
            : index === 'n+3'
              ? position >= 3
              : position === (index === '0n+3' ? 3 : Number(index))
        })
        expect(
          engine.select(selector, parent),
          `${selector}, round ${round}`,
        ).toEqual(expected)
        expect(engine.first(selector, parent)).toBe(expected[0] ?? null)
        for (const element of parent.children) {
          expect(engine.match(selector, element)).toBe(
            expected.includes(element),
          )
        }
      }
      parent.prepend(document.createElement('i'))
      parent.lastElementChild!.remove()
      parent.remove()
    }
    const orphan = document.createElement('i')
    expect(engine.match(`:${pseudo}(1)`, orphan)).toBe(true)
    expect(engine.match(`:${pseudo}(2)`, orphan)).toBe(false)
  })
}
