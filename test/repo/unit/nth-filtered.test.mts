import { registerLegacy } from '../common/legacy.mts'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'

for (const legacy of [false, true]) {
  test(`filtered child positions handle lists, nesting and mutations (legacy=${legacy})`, t => {
    const { window } = new JSDOM(
      '<main><p id="a" class="item"></p>text<!-- gap --><b id="b"></b><p id="c" class="item" data-label="of , )"></p><p id="d" class="item special"><i></i></p><p id="e"></p></main>',
    )
    t.onTestFinished(() => window.close())
    const { document } = window
    const engine = registerLegacy(factory(window))
    engine.configure({ LEGACY: legacy })
    const main = document.querySelector('main')!
    const cases = new Map([
      ['p:nth-child(2 of .item)', ['c']],
      ['p:nth-child(2 of.item)', ['c']],
      ['p:nth-child(1 of[data-label])', ['c']],
      ['p:nth-last-child(1 of.item)', ['d']],
      ['p:nth-last-child(1 of .item)', ['d']],
      ['p:nth-child(even of .item)', ['c']],
      ['p:nth-child(odd of .item)', ['a', 'd']],
      ['p:nth-child(-n+2 of .item)', ['a', 'c']],
      ['p:nth-child(0n+2 of .item)', ['c']],
      ['p:nth-child(0 of .item)', []],
      ['p:nth-child(n of .item)', ['a', 'c', 'd']],
      ['p:nth-child(1 of .item, #b)', ['a']],
      ['p:nth-child(2 of main > p.item)', ['c']],
      ['p:nth-child(2 of :scope > .item)', ['c']],
      ['p:nth-child(1 of [data-label="of , )"], :has(i))', ['c']],
      ['p:nth-child(2 of :nth-child(odd))', ['c']],
      ['p:nth-child(1 of :nth-child(2n of .item))', ['c']],
      ['p:not(:nth-child(2 of .item))', ['a', 'd', 'e']],
      ['p:nth-child(2 of .item) + p', ['d']],
      ['p:nth-child(2 of :is(.item,:unknown-pseudo))', ['c']],
      [':is(p:nth-child(1 of :unknown-pseudo), #c)', ['c']],
    ])
    for (const [selector, ids] of cases) {
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(
          Array.from(engine.select(selector, main), node => node.id),
          selector,
        ).toEqual(ids)
        expect(engine.first(selector, main)?.id, selector).toBe(ids[0])
        for (const node of main.children) {
          expect(engine.match(selector, node), `${selector}: ${node.id}`).toBe(
            ids.includes(node.id),
          )
        }
      }
    }
    main.children[0]!.classList.remove('item')
    expect(
      Array.from(
        engine.select(':nth-child(2 of .item)', main),
        node => node.id,
      ),
    ).toEqual(['d'])
    main.prepend(main.children[3]!)
    expect(
      Array.from(
        engine.select(':nth-child(2 of .item)', main),
        node => node.id,
      ),
    ).toEqual(['c'])
    const fragment = document.createDocumentFragment()
    fragment.append(...main.childNodes)
    expect(
      Array.from(
        engine.select(':nth-last-child(1 of .item)', fragment),
        node => node.id,
      ),
    ).toEqual(['c'])
    const detached = document.createElement('p')
    detached.className = 'item'
    expect(engine.match(':nth-child(1 of .item)', detached)).toBe(true)
    expect(engine.match(':nth-child(2 of .item)', detached)).toBe(false)
  })
}

test('filtered lists reject invalid syntax even without candidates', t => {
  const { window } = new JSDOM('')
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  for (const selector of [
    'missing:nth-child(1 of)',
    'missing:nth-child(of .item)',
    'missing:nth-child(1 of .item,)',
    'missing:nth-child(1 of > p)',
    'missing:nth-child(1 of :unknown-pseudo)',
    'missing:nth-of-type(1 of .item)',
    'missing:nth-last-of-type(1 of .item)',
    'missing:nth-child(+ n of .item)',
    'missing:nth-child(2n0 of .item)',
    'missing:nth-child(1of .item)',
    'missing:nth-child(1 ofp)',
    'missing:nth-child(1 of-item)',
    'missing:nth-child(1 of\u00e9)',
  ]) {
    expect(() => engine.select(selector), selector).toThrowError(
      expect.objectContaining({ name: 'SyntaxError' }),
    )
  }
})

test('filtered selection and first-result search read each sibling once', t => {
  const { window } = new JSDOM(
    '<main>' + '<p class="item"></p>'.repeat(200) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const main = window.document.querySelector('main')!
  const nodes = [...main.children]
  let reads = 0
  for (const node of nodes) {
    Object.defineProperty(node, 'className', {
      get() {
        reads++
        return 'item'
      },
    })
  }
  const selector = 'p:nth-last-child(1 of .item)'
  expect(engine.first(selector, main)).toBe(nodes[199])
  expect(reads).toBe(200)
  reads = 0
  expect(engine.select(selector, main)).toEqual([nodes[199]])
  expect(reads).toBe(200)
  reads = 0
  const resolve = engine.compile(':nth-child(2n of .item)', true)!
  expect(resolve(nodes.toReversed(), null, main, [])).toEqual(
    nodes.filter((_, index) => index % 2 === 1).toReversed(),
  )
  expect(reads).toBe(200)
})

test('direct filtered resolvers observe callback mutations and release state on exceptions', t => {
  const { window } = new JSDOM(
    '<main><p id="a" class="item"></p><p id="b" class="item"></p><p id="c" class="item"></p><p id="d" class="item"></p><p id="e" class="item"></p></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  const main = window.document.querySelector('main')!
  const nodes = [...main.children]
  const resolve = engine.compile(':nth-child(even of .item)', true, true)!
  const result = resolve(
    nodes,
    node => {
      if (node.id === 'b') {
        nodes[0]!.classList.remove('item')
      }
      return false
    },
    main,
    [],
  ) as Element[]
  expect(result.map(node => node.id)).toEqual(['b', 'c', 'e'])
  expect(() =>
    resolve(
      nodes,
      () => {
        throw new Error('callback failure')
      },
      main,
      [],
    ),
  ).toThrow('callback failure')
  nodes[0]!.classList.add('item')
  expect(engine.select(':nth-child(even of .item)', main)).toEqual([
    nodes[1],
    nodes[3],
  ])
})
