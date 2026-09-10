import v8 from 'node:v8'
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'
import {
  STATE_PSEUDOS,
  build,
  wireMatchesToNwsapi,
} from './selector-fixture.mts'
import './selector-reference.cases.mts'

describe('state pseudo-classes under a host that delegates to nwsapi', () => {
  for (const pseudo of STATE_PSEUDOS) {
    test(`${pseudo} does not re-enter the engine`, () => {
      const { window, document, NW } = build(
        '<!doctype html><body><div id=d></div></body>',
      )
      const element = document.getElementById('d')
      const calls = wireMatchesToNwsapi(window, NW)

      // The result is a plain boolean, and the engine asks the host matcher
      // at most once. A re-entrant call is what exhausted the stack in
      // 2.2.26/2.2.27 and was then swallowed as `false`
      // (dperini/nwsapi#172), so what matters is that the recursion stops,
      // not that the host is never asked: a host whose matcher is real, as
      // in a browser, is where the answer has to come from.
      expect(typeof NW.match(pseudo, element!)).toBe('boolean')
      expect(
        calls(),
        `${pseudo} re-entered Element.prototype.matches`,
      ).toBeLessThanOrEqual(1)

      // Having learned that this host routes back into the engine, it is not
      // asked again for the same document.
      const asked = calls()
      for (let i = 0; i < 10; ++i) {
        NW.match(pseudo, element!)
      }
      expect(calls(), `${pseudo} kept asking a host that delegates`).toBe(asked)
    })
  }

  test(':modal resolves quickly and repeatedly', () => {
    const { window, document, NW } = build(
      '<!doctype html><body><button id=b>x</button></body>',
    )
    const element = document.getElementById('b')
    wireMatchesToNwsapi(window, NW)

    // 2.2.26 spent roughly a second per call here, exhausting the stack each
    // time. A generous ceiling still separates the two behaviors by orders
    // of magnitude, so this stays meaningful without being timing-flaky.
    const started = Date.now()
    for (let i = 0; i < 50; ++i) {
      expect(NW.match(':modal', element!)).toBe(false)
    }
    expect(Date.now() - started).toBeLessThan(1000)
  })

  test('an open <dialog> still matches :modal via the fullscreen flag', () => {
    const { window, document, NW } = build(
      '<!doctype html><body><dialog id=g open>hi</dialog></body>',
    )
    wireMatchesToNwsapi(window, NW)
    const dialog = document.getElementById('g')

    // Without a native matcher there is no "is modal" flag to read, so the
    // detectable half is the fullscreen element pointer.
    expect(NW.match(':modal', dialog!)).toBe(false)
    Object.defineProperty(document, 'fullscreenElement', {
      value: dialog,
      configurable: true,
    })
    expect(NW.match(':modal', dialog!)).toBe(true)
  })

  test(':open and :closed read the DOM state without a native matcher', () => {
    const { document, NW } = build(
      '<!doctype html><body><details id=o open></details><details id=c></details></body>',
    )
    expect(NW.match(':open', document.getElementById('o')!)).toBe(true)
    expect(NW.match(':closed', document.getElementById('o')!)).toBe(false)
    expect(NW.match(':open', document.getElementById('c')!)).toBe(false)
    expect(NW.match(':closed', document.getElementById('c')!)).toBe(true)
  })
})

describe('logical selector arguments containing parentheses', () => {
  // dperini/nwsapi#165: the argument of :is()/:where() was delimited by a
  // regular expression, so a nested :not()/:nth-child() ended the argument at
  // the wrong parenthesis and the selector silently matched nothing.
  test(':is() with a nested :not() and :nth-child() matches', () => {
    const { document, NW } = build(
      '<table><thead><tr><th data-column-index="1"><div role="button">Sort</div></th></tr></thead></table>',
    )
    const thead = document.querySelector('thead')
    const expected = document.querySelector('div[role=button]')

    expect(
      NW.first(':is(th[data-column-index="1"]) [role=button]', thead!),
    ).toBe(expected)
    expect(NW.first(':is(tr > th) [role=button]', thead!)).toBe(expected)
    expect(
      NW.first(
        ':is(th[data-column-index="1"], tr:not([data-group-level]) > *:nth-child(1)) [role=button]',
        thead!,
      ),
    ).toBe(expected)
  })

  test('nested logical selectors keep their own closing parenthesis', () => {
    const { document, NW } = build(
      '<!doctype html><body><div id=a></div><span id=b></span></body>',
    )
    const ids = (selector: string) =>
      Array.from(NW.select(selector, document.body)).map(e => e.id)

    expect(ids(':not(:is(div))')).toEqual(['b'])
    expect(ids(':not(:not(div))')).toEqual(['a'])
    expect(ids(':is(div, :is(span))')).toEqual(['a', 'b'])
  })

  test('a pseudo-class may be followed by a quoted attribute selector', () => {
    // dperini/nwsapi#175: the combinator inside the validator's pseudo-class
    // pattern consumed the character after it, eating the '[' of the next
    // attribute selector. Needs all three: the i flag, a pseudo-class on the
    // same compound, and a quoted attribute selector after the combinator.
    const { document, NW } = build(
      '<div><p class="a">t</p><p class="b" id="t"></p></div>',
    )
    const target = document.getElementById('t')

    expect(NW.match("[class*='a' i]:not(:empty) + [class*='b']", target!)).toBe(
      true,
    )
    expect(NW.match('[class*="a" i]:not(:empty) + [class*="b"]', target!)).toBe(
      true,
    )
    expect(NW.match("[class*='a' i]:not(.x) + [class*='b']", target!)).toBe(
      true,
    )
    expect(
      NW.match("[class*='a' i]:not(:empty) + [class*='zz']", target!),
    ).toBe(false)
  })

  test('a parse error reports the selector, not the fragments that matched', () => {
    const { NW } = build('<!doctype html><body></body>')
    // The fragments joined by String() read as a corrupted selector, which is
    // how dperini/nwsapi#175 came to be reported as mangled quotes.
    expect(() => NW.select('div ??? span')).toThrow(/'div \?\?\? span'/)
  })

  test('an unclosed argument is closed by EOF', () => {
    const { document, NW } = build(
      '<!doctype html><body><div id=a class=x></div><div id=b></div></body>',
    )
    const ids = (selector: string) =>
      Array.from(NW.select(selector, document.body)).map(e => e.id)

    // CSS Syntax closes any construct left open at EOF, so these are valid.
    expect(ids('div:not([class]')).toEqual(['b'])
    expect(ids('div:not([class')).toEqual(['b'])
    expect(ids('div:is([class="x"')).toEqual(['a'])
  })
})

describe('what the selector cache holds on to', () => {
  // The cache keeps a plan per selector. A plan that also carried the result
  // list and the context kept every element it had matched alive for as long
  // as that selector stayed cached, which in a jsdom suite means for the life
  // of the document. WeakRef answers this directly, where a heap reading only
  // ever suggests an answer.
  function exposeGc() {
    if (typeof globalThis.gc === 'function') {
      return globalThis.gc
    }
    // Playwright runs this file without --expose-gc.
    v8.setFlagsFromString('--expose-gc')
    try {
      return vm.runInNewContext('gc')
    } finally {
      v8.setFlagsFromString('--no-expose-gc')
    }
  }

  async function collectGarbage(gc: () => void) {
    for (let i = 0; i < 5; ++i) {
      gc()
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  async function subtreeSurvives({ query }: { query: string | null }) {
    const gc = exposeGc()
    const { document, NW } = build('<!doctype html><body></body>')

    const ref = (() => {
      const host = document.createElement('div')
      host.className = 'host'
      for (let i = 0; i < 200; ++i) {
        const leaf = document.createElement('span')
        leaf.className = 'leaf'
        host.appendChild(leaf)
      }
      document.body.appendChild(host)
      if (query) {
        NW.select(query, document)
      }
      host.remove()
      return new WeakRef(host)
    })()

    await collectGarbage(gc)
    const alive = ref.deref() !== undefined
    // The engine has to outlive the reading, or there is nothing to retain.
    expect(NW).toBeTruthy()
    return alive
  }

  test('a removed subtree is collectable, queried or not', async () => {
    // Control: with no query at all the subtree must already be collectable,
    // otherwise the test proves nothing about the cache.
    expect(await subtreeSurvives({ query: null })).toBe(false)
    expect(await subtreeSurvives({ query: 'div.host span.leaf' })).toBe(false)
    // Two required ancestor tags, which is what turns on the ancestor
    // filter: its summaries key on elements, so they have to be dropped with
    // the call rather than held until the next one.
    expect(await subtreeSurvives({ query: 'body div span' })).toBe(false)
  })

  test('a cached plan is reused across contexts', () => {
    const { document, NW } = build(
      '<!doctype html><body><div id=one><p class=t>a</p></div>' +
        '<div id=two><p class=t>b</p><p class=t>c</p></div></body>',
    )
    // The plan is context-free, so the second context must not see the first
    // context's answer: caching the results is exactly how that would happen.
    expect(NW.select('p.t', document.getElementById('one')!).length).toBe(1)
    expect(NW.select('p.t', document.getElementById('two')!).length).toBe(2)
    expect(NW.select('p.t', document.getElementById('one')!).length).toBe(1)
    expect(NW.select('p.t', document).length).toBe(3)
  })
})

describe('id lookups without document.all', () => {
  // jsdom does not implement document.all, so nwsapi's id path fell through
  // to walking the subtree: 2.4ms against 43ns for getElementById on a
  // 6300-element document. These lock in the behavior the fast paths must
  // preserve — duplicate ids all match, an element-scoped query is scoped,
  // and an escaped id still resolves.
  const MARKUP =
    '<!doctype html><body>' +
    '<div id=outer><span id=dup>1</span></div>' +
    '<span id=dup>2</span><span id=uniq>3</span><b id="a.b">esc</b>' +
    '</body>'

  test('select() returns every element carrying the id', () => {
    const { document, NW } = build(MARKUP)
    const text = (list: ArrayLike<Element>) =>
      Array.from(list, node => node.textContent)

    expect(text(NW.select('#dup', document))).toEqual(['1', '2'])
    expect(text(NW.select('#dup', document.getElementById('outer')!))).toEqual([
      '1',
    ])
    expect(text(NW.select('#uniq', document))).toEqual(['3'])
    expect(NW.select('#nope', document)).toEqual([])
  })

  test('select() finds ids inside a detached subtree', () => {
    // The miss fast path asks the document, which knows nothing about a
    // detached subtree, so that case has to keep walking.
    const { document, NW } = build(MARKUP)
    const detached = document.createElement('div')
    detached.innerHTML = '<b id=det>d</b>'
    expect(
      Array.from(NW.select('#det', detached)).map(node => node.textContent),
    ).toEqual(['d'])
  })

  test('first() returns the first in tree order', () => {
    const { document, NW } = build(MARKUP)
    const text = (node: Element | null) => (node ? node.textContent : null)

    expect(text(NW.first('#dup', document))).toBe('1')
    expect(text(NW.first('#dup', document.getElementById('outer')!))).toBe('1')
    expect(text(NW.first('#uniq', document))).toBe('3')
    expect(text(NW.first('#a\\.b', document))).toBe('esc')
    expect(NW.first('#nope', document)).toBeNull()
  })

  test('first() still invokes the callback', () => {
    const { document, NW } = build(MARKUP)
    const seen: Array<string | null> = []
    const found = NW.first('#uniq', document, node =>
      seen.push(node.textContent),
    )
    expect(found!.textContent).toBe('3')
    expect(seen).toEqual(['3'])
  })

  test('an id lookup does not walk the document', () => {
    // A document big enough that walking it is visible: the fast path is
    // sub-microsecond and a walk is milliseconds, so the ceiling separates
    // the two by orders of magnitude without being timing-flaky.
    let markup = '<!doctype html><body>'
    for (let i = 0; i < 4000; ++i) {
      markup += `<div class=n><span>${i}</span></div>`
    }
    markup += '<i id=needle>found</i></body>'
    const { document, NW } = build(markup)

    const started = Date.now()
    for (let i = 0; i < 200; ++i) {
      expect(NW.first('#needle', document)!.textContent).toBe('found')
      expect(NW.select('#missing', document)).toEqual([])
    }
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('generated code that only reads correctly by accident', () => {
  // /^a|area$/ alternates '^a' with 'area$' instead of anchoring an
  // alternation, so it accepts any name starting with 'a'. The engine
  // agreed with browsers on <a> and <area>, which is why the WPT suite
  // never caught it.
  test(':link and :any-link need an <a> or <area>', () => {
    const { document, NW } = build(
      '<!doctype html><body>' +
        '<a id=a href="#">a</a><area id=r href="#">' +
        '<abbr id=b href="#">abbr</abbr><article id=c href="#">art</article>' +
        '<audio id=d href="#"></audio>' +
        '</body>',
    )
    const ids = (selector: string) =>
      Array.from(NW.select(selector, document)).map(node => node.id)

    expect(ids(':link')).toEqual(['a', 'r'])
    expect(ids(':any-link')).toEqual(['a', 'r'])
    expect(ids(':visited')).toEqual([])
    // an <a> without href is not a link
    document.getElementById('a')!.removeAttribute('href')
    expect(ids(':link')).toEqual(['r'])
  })

  test(':placeholder-shown needs an <input> or <textarea>', () => {
    // Same shape of mistake, /^input|textarea$/, masked by the conditions
    // around it rather than by being right.
    const { document, NW } = build(
      '<!doctype html><body>' +
        '<input id=a placeholder=p>' +
        '<input-thing id=b placeholder=p></input-thing>' +
        '<textarea id=c placeholder=p></textarea>' +
        '</body>',
    )
    expect(
      Array.from(NW.select(':placeholder-shown', document)).map(
        node => node.id,
      ),
    ).toEqual(['a', 'c'])
  })
})

describe('what a cached plan replays', () => {
  test('an escaped identifier resolves the same way twice', () => {
    // The plan records the token its candidate list is fetched with. It used
    // to record the escaped form while the first run selected on the
    // unescaped one, so the second call — the one served from the cache —
    // asked the document for a different name.
    const { document, NW } = build(
      '<!doctype html><body><i id=t class="a.b">x</i><i id=u class="c d">y</i></body>',
    )
    for (const selector of ['.a\\.b', 'i.a\\.b', '.c.d'] as const) {
      const first = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      const second = Array.from(NW.select(selector, document)).map(
        node => node.id,
      )
      expect(second, `${selector} differs when served from the cache`).toEqual(
        first,
      )
      expect(first.length).toBe(1)
    }
  })

  test('a selector still resolves after the cache has turned over', () => {
    // More distinct selectors than the cache holds, so the entry for the
    // selector under test is evicted and rebuilt. The two-generation policy
    // drops a whole generation at a time, which is exactly where a stale or
    // half-dropped plan would show up.
    const { document, NW } = build(
      '<!doctype html><body><b id=hot class=hot>h</b></body>',
    )
    const hot = () =>
      Array.from(NW.select('b.hot', document)).map(node => node.id)

    expect(hot()).toEqual(['hot'])
    for (let i = 0; i < 5000; ++i) {
      NW.select(`.filler-${i}:not(.other-${i})`, document)
    }
    expect(
      hot(),
      'evicted and recompiled must agree with the first answer',
    ).toEqual(['hot'])
  })
})

import './selector-descendant.cases.mts'
