import { describe, expect, test } from 'vitest'
import { build } from './selector-fixture.mts'

describe('a descendant chain of tags answered by descending', () => {
  // 'div ul li a' matched right to left starts from every <a> in the context.
  // Descending from the leftmost tag instead returns the answer directly, so
  // these cover what the resolver would otherwise have guaranteed: document
  // order, no duplicates, scoping, and the cases that must not take the path.
  function fixture() {
    return build(
      '<!doctype html><body>' +
        '<div id=d1><ul id=u1><li id=l1><a id=a1>1</a></li></ul></div>' +
        // nested same-tag chains: the naive descent returns these twice
        '<div id=d2><div id=d3><ul id=u2><li id=l2><a id=a2>2</a>' +
        '<ul id=u3><li id=l3><a id=a3>3</a></li></ul></li></ul></div></div>' +
        '<ul id=u4><li id=l4><a id=a4>4</a></li></ul>' +
        '<a id=a5>5</a>' +
        '</body>',
    )
  }

  test('the same elements as the reference engine, in the same order', () => {
    const { document, NW } = fixture()
    for (const selector of [
      'div ul li a',
      'div div ul li a',
      'ul li a',
      'body a',
      'div ul',
      'ul li',
      'body div div',
      'html body ul li a',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
    }
  })

  test('a nested match is returned once', () => {
    // u3 sits inside u2, so a3 is reachable through both; descending level by
    // level would collect it twice without the containment check.
    const { document, NW } = fixture()
    expect(
      Array.from(NW.select('ul li a', document)).map(node => node.id),
    ).toEqual(['a1', 'a2', 'a3', 'a4'])
    expect(
      Array.from(NW.select('ul ul li a', document)).map(node => node.id),
    ).toEqual(['a3'])
  })

  test('scoped to an element, and to a detached subtree', () => {
    const { document, NW } = fixture()
    const scope = document.getElementById('d2')
    expect(
      Array.from(NW.select('ul li a', scope!)).map(node => node.id),
    ).toEqual(['a2', 'a3'])
    expect(
      Array.from(scope!.querySelectorAll('ul li a'), node => node.id),
    ).toEqual(['a2', 'a3'])

    const detached = document.createElement('div')
    detached.innerHTML = '<ul><li><a id=x>x</a></li></ul>'
    expect(
      Array.from(NW.select('ul li a', detached)).map(node => node.id),
    ).toEqual(['x'])
  })

  test('a callback still sees every match', () => {
    // The descent returns the answer rather than a candidate list, so a query
    // carrying a callback has to stay on the ordinary path.
    const { document, NW } = fixture()
    const seen: Array<string | null> = []
    const found = NW.select('ul li a', document, node => seen.push(node.id))
    expect(Array.from(found).map(node => node.id)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ])
    expect(seen).toEqual(['a1', 'a2', 'a3', 'a4'])
  })

  test('first() returns the first in tree order', () => {
    const { document, NW } = fixture()
    expect(NW.first('div ul li a', document)!.id).toBe('a1')
    expect(NW.first('ul ul li a', document)!.id).toBe('a3')
    expect(NW.first('div span a', document)).toBeNull()
  })

  test('a chain that is not plain tags is unaffected', () => {
    const { document, NW } = fixture()
    for (const selector of [
      'div.x ul li a',
      'div ul li a.y',
      'div > ul li a',
      'div ul li a:first-child',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
    }
  })

  // A level wide enough to matter is routed by counting how many elements of
  // the last part the context holds, so these cover the wide shapes and the
  // one hazard the counting brings: a count outliving the document it
  // describes.
  function wide(inner: (index: number) => string, tail: string | undefined) {
    let html = '<!doctype html><body>'
    for (let i = 0; i < 200; ++i) {
      html += `<ul id=u${i}><li id=l${i}>${inner(i)}</li></ul>`
    }
    return build(`${html}${tail ?? ''}</body>`)
  }

  test('a level too wide for the budget answers the same', () => {
    const { document, NW } = wide(
      i => `<a id=a${i}>${i}</a>`,
      '<a id=loose>x</a>',
    )
    for (const selector of [
      'ul li a',
      'ul li',
      'body ul li a',
      'body li a',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
      expect(mine.length, selector).toBeGreaterThan(0)
    }
  })

  test('a count taken before a change does not decide the answer', () => {
    // Nothing of the last part is in the document, so the count taken on the
    // first query is zero. It may pick the route for the second query and
    // must not stand in for its answer.
    const { document, NW } = wide(() => '', undefined)
    expect(NW.select('ul li a', document)).toEqual([])

    const link = document.createElement('a')
    link.id = 'late'
    document.getElementById('l7')!.append(link)
    expect(
      Array.from(NW.select('ul li a', document)).map(node => node.id),
    ).toEqual(['late'])

    link.remove()
    expect(NW.select('ul li a', document)).toEqual([])
  })
})

describe(':not() with a compound argument', () => {
  // The argument compiles in place rather than going back out through match()
  // once per candidate, so these cover the shapes that inline, the shapes that
  // must not, and that an inlined argument leaves the surrounding walk alone.
  function fixture() {
    return build(
      '<!doctype html><body>' +
        '<div id=d1 class=x><p id=p1 class=a>1</p><p id=p2 class=b>2</p><p id=p3>3</p></div>' +
        '<div id=d2><span id=s1></span></div>' +
        '<div id=d3><div id=d4><p id=p4 class=a>4</p></div></div>' +
        '</body>',
    )
  }

  test('the same answer as the reference engine', () => {
    const { document, NW } = fixture()
    for (const selector of [
      // compound arguments, which compile in place
      'p:not(.a)',
      'p:not(#p1)',
      'p:not([class])',
      'p:not([class="a"])',
      'p:not(:first-child)',
      'p:not(:nth-of-type(2n))',
      'div:not(:nth-of-type(2n))',
      'p:not(:is(.a, .b))',
      'p:not(:not(.a))',
      'div:not(:has(p))',
      'p:not(.a):not(.b)',
      'div p:not(.a)',
      'div:not(.x) p',
      // arguments that keep the call: a list, and a combinator
      'p:not(.a, .b)',
      'div:not(p > span)',
      'div:not(div p)',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
    }
  })

  test('match() agrees with select() on the same element', () => {
    const { document, NW } = fixture()
    const p2 = document.getElementById('p2')
    expect(NW.match('p:not(.a)', p2!)).toBe(true)
    expect(NW.match('p:not(.b)', p2!)).toBe(false)
    expect(NW.match('p:not(:nth-of-type(2n))', p2!)).toBe(false)
    expect(NW.match('div p:not(.a)', p2!)).toBe(true)
  })

  test('an argument the engine cannot read is a syntax error', () => {
    const { document, NW } = fixture()
    for (const selector of [
      'p:not(@@)',
      'p:not()',
      'div:not(svg|div)',
    ] as const) {
      expect(() => NW.select(selector, document), selector).toThrow()
      expect(() => document.querySelectorAll(selector), selector).toThrow()
    }
    // an argument left unclosed is closed by EOF, as the syntax parser does
    expect(
      Array.from(NW.select('p:not(.a', document)).map(node => node.id),
    ).toEqual(['p2', 'p3'])
  })
})
