import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

test('constant positions share dense parents without penalizing sparse candidates', t => {
  const { window } = new JSDOM('<!doctype html><main></main><aside></aside>')
  t.onTestFinished(() => window.close())
  const { document } = window
  const engine = factory(window)
  const main = document.querySelector('main')!
  const aside = document.querySelector('aside')!
  main.innerHTML = '<i></i>'.repeat(300)
  aside.innerHTML = '<i></i>'.repeat(10)
  const check = () => {
    for (const selector of [
      'i:nth-child(3)',
      'i:nth-last-child(3)',
      'i:not(:nth-child(3))',
      'i:nth-child(3):nth-last-child(298)',
    ] as const) {
      expect(engine.select(selector), selector).toEqual([
        ...document.querySelectorAll(selector),
      ])
    }
  }
  check()
  aside.append(main.firstElementChild!)
  main.prepend(document.createElement('b'))
  check()
  const fragment = document.createDocumentFragment()
  fragment.append(...main.children)
  expect(engine.select('i:nth-child(3)', fragment)).toEqual([
    fragment.children[2],
  ])
  // A sparse candidate near the start should not walk from the far end.
  const sparse = fragment.children[1]
  let reads = 0
  Object.defineProperty(fragment, 'lastElementChild', {
    get() {
      ++reads
      return fragment.children[fragment.children.length - 1]
    },
  })
  const resolve = engine.compile(':nth-last-child(200)', true)!
  expect(resolve([sparse], null, fragment, [])).toEqual([])
  expect(reads).toBe(0)
  const repeated = 'i' + ':nth-child(3)'.repeat(20)
  expect(engine.select(repeated, fragment)).toEqual([fragment.children[2]])
  expect(engine.compile(repeated, true)!.toString().length).toBeLessThan(20_000)
})

for (const pseudo of [
  'nth-child',
  'nth-last-child',
  'nth-of-type',
  'nth-last-of-type',
] as const) {
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
      ] as const) {
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
