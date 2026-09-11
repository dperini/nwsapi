import { describe, expect, test } from 'vitest'
import {
  build,
  buildModern,
  ids,
  MARKUP,
  SELECTORS,
} from './fixture/legacy.mts'
import './legacy-resolver.cases.mts'

test('legacy named collections reject names that do not match an element ID', () => {
  const { NW, document, window } = buildModern(
    '<input name="target" id="one"><input name="target" id="two">',
  )
  try {
    const candidates = document.querySelectorAll('input')
    Object.defineProperty(document, 'all', {
      value: { target: candidates },
      configurable: true,
    })
    NW.configure({ LEGACY: true, IDS_DUPES: true })
    expect(NW.byId('target', document)).toEqual([])
    expect(NW.select('#target', document)).toEqual([])
    expect(NW.first('#target', document)).toBeNull()
    candidates[1]!.id = 'target'
    expect(NW.byId('target', document)).toEqual([candidates[1]])
    expect(NW.select('#target', document)).toEqual([candidates[1]])
  } finally {
    window.close()
  }
})

test('relative has arguments use legacy sibling traversal', () => {
  const { NW, host, window } = build(
    '<div id="a"></div><div id="b"><p></p></div><div id="c"></div>',
  )
  try {
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(ids(NW.select('div:has(+ div)', host))).toEqual(['a', 'b'])
      expect(ids(NW.select('div:has(~ div)', host))).toEqual(['a', 'b'])
      expect(ids(NW.select('div:has(+ div p)', host))).toEqual(['a'])
      expect(ids(NW.select('div:has(~ div p)', host))).toEqual(['a'])
    }
  } finally {
    window.close()
  }
})

test('LEGACY restores the handling a pre-2015 host needed', () => {
  // The generated tests read reflected properties and call the host without
  // asking whether it has the method, because every host that can run this
  // source returns elements from a tag or class lookup. LEGACY is for one
  // that does not: IE up to 8 put comment nodes in a '*' collection.
  const { document, NW } = buildModern(
    '<!doctype html><body><a href="#" id=a class="x big">x</a><!-- c --></body>',
  )
  const comment = document.body.childNodes[1]
  const scope = document.createElement('div')
  scope.innerHTML = '<a href="#" id=b class="x big">y</a>'
  const link = scope.firstChild
  // a host handing back something that is not an element
  Object.defineProperties(scope, {
    getElementsByTagName: { value: () => [link, document.createComment('c')] },
    getElementsByClassName: {
      value: () => [link, document.createComment('c')],
    },
  })

  // by default the fetch is trusted, so a collection like that is an error
  // rather than a non-match
  expect(() => NW.select('[href]', scope)).toThrow()
  expect(() => NW.select('.x.big', scope)).toThrow()
  // a tag test reads a property, so it rejects the comment either way
  expect(
    Array.from(NW.select('a.x', scope)).map((node: Element) => node.id),
  ).toEqual(['b'])

  try {
    NW.configure({ LEGACY: true })
    expect(
      Array.from(NW.select('[href]', scope)).map((node: Element) => node.id),
    ).toEqual(['b'])
    expect(
      Array.from(NW.select('.x.big', scope)).map((node: Element) => node.id),
    ).toEqual(['b'])
    expect(NW.match('.x', comment as unknown as Element)).toBe(false)
    expect(NW.match('[href]', comment as unknown as Element)).toBe(false)
    expect(NW.match('#a', comment as unknown as Element)).toBe(false)

    // and the ordinary answers do not change under it
    for (const selector of [
      'a.x',
      'a#a',
      '#a.big',
      'a[href]',
      '.x.big',
    ] as const) {
      const mine = Array.from(NW.select(selector, document)).map(
        (node: Element) => node.id,
      )
      const reference = Array.from(
        document.querySelectorAll(selector),
        node => node.id,
      )
      expect(mine, selector).toEqual(reference)
    }
  } finally {
    NW.configure({ LEGACY: false })
  }

  // flipping the flag has to reach the compiled resolvers, not just the
  // next selector nobody has asked for yet
  expect(() => NW.select('[href]', scope)).toThrow()
})

describe('a host that needs the legacy handling', () => {
  test('the host is missing what those browsers were missing', () => {
    const { host } = build(MARKUP)
    const root = host.documentElement
    expect(Reflect.get(root, 'hasAttribute'), 'hasAttribute').toBeUndefined()
    expect(root.localName, 'localName').toBeUndefined()
    expect(root.firstElementChild, 'firstElementChild').toBeUndefined()
    expect(root.nextElementSibling, 'nextElementSibling').toBeUndefined()
    expect(root.parentElement, 'parentElement').toBeUndefined()
    expect(root.classList, 'classList').toBeUndefined()
    expect(
      Reflect.get(host, 'getElementsByClassName'),
      'getElementsByClassName',
    ).toBeUndefined()
    expect(
      Reflect.get(root, 'getAttributeNames'),
      'getAttributeNames',
    ).toBeUndefined()
    expect(root.isConnected, 'isConnected').toBeUndefined()
    // and its tag collection is not all elements
    const all = Array.prototype.slice.call(host.getElementsByTagName('*'))
    expect(
      all.some(node => node.nodeType === 8),
      'comment nodes in the collection',
    ).toBe(true)
  })

  test('the engine turns the handling on by itself', () => {
    const { NW } = build(MARKUP)
    expect(NW.configure()['LEGACY']).toBe(true)
  })

  test('switching from a modern document invalidates direct-read resolvers', () => {
    const modern = buildModern(MARKUP)
    const legacy = build(MARKUP)
    expect(ids(modern.NW.select('div.box > p.a', modern.document))).toEqual([
      'p1',
      'p3',
    ])
    expect(modern.NW.configure()['LEGACY']).toBe(false)
    expect(ids(modern.NW.select('div.box > p.a', legacy.host))).toEqual([
      'p1',
      'p3',
    ])
    expect(modern.NW.configure()['LEGACY']).toBe(true)
    expect(ids(modern.NW.select('div.box > p.a', modern.document))).toEqual([
      'p1',
      'p3',
    ])
    expect(modern.NW.configure()['LEGACY']).toBe(true)
  })

  test('URL reads are selected again for each document', () => {
    const flag = build(MARKUP)
    const node = build(MARKUP, { urls: 'plain' })
    for (const host of [flag.host, node.host, flag.host] as const) {
      expect(ids(flag.NW.select('a[href="./go"]', host))).toEqual(['a1'])
    }
  })

  test('every selector shape answers what the reference engine answers', () => {
    const { NW, host, document } = build(MARKUP)
    for (const selector of SELECTORS) {
      const mine = ids(NW.select(selector, host))
      const reference = ids(document.querySelectorAll(selector))
      expect(mine, selector).toEqual(reference)
    }
  })

  test('match, first and closest agree as well', () => {
    const { NW, host, document } = build(MARKUP)
    const byId = (id: string) => {
      const node = host.getElementById(id)!
      expect(node, id).toBeTruthy()
      return node
    }

    expect(NW.match('p.a', byId('p1'))).toBe(true)
    expect(NW.match('p.b', byId('p1'))).toBe(false)
    expect(NW.match('div > p:first-child', byId('p1'))).toBe(true)
    expect(NW.match('[for="x"]', byId('a1'))).toBe(true)
    expect(NW.match('input[checked]', byId('i1'))).toBe(true)

    expect(NW.first('div p', host)!.id).toBe(
      document.querySelector('div p')!.id,
    )
    expect(NW.first('li.row', host)!.id).toBe('l2')
    expect(NW.first('table', host)).toBeNull()

    expect(NW.closest('div', byId('p1'))!.id).toBe('d1')
    expect(NW.closest('#d2', byId('p1')!)).toBeNull()
  })

  test('a query scoped to an element stays inside it', () => {
    const { NW, host, document } = build(MARKUP)
    const scope = host.getElementById('d2')!
    for (const selector of [
      'li',
      'ul li',
      '.row',
      'input[checked]',
      '*',
    ] as const) {
      const mine = ids(NW.select(selector, scope))
      const reference = ids(
        document.getElementById('d2')!.querySelectorAll(selector)!,
      )
      expect(mine, selector).toEqual(reference)
    }
  })
})

describe('pseudo-classes on a host that needs the handling', () => {
  // Some of these read properties older than the hosts LEGACY is for, so
  // they work there; others read properties that postdate them, so they
  // match nothing. Either way none of them may throw, and the ones that can
  // work have to agree with the reference engine.
  const FORM =
    '<!doctype html><html lang=en><body><div id=d1>' +
    '<input id=i1 disabled><input id=i2><input id=i3 type=checkbox checked>' +
    '<a id=a1 href="#x">l</a><span id=s1></span>' +
    '<fieldset id=fs disabled><legend id=lg><input id=i5></legend><input id=i4></fieldset>' +
    '<select id=se><optgroup id=og disabled><option id=op>o</option></optgroup></select>' +
    '</div></body></html>'

  const PSEUDOS = [
    ':disabled',
    ':enabled',
    ':checked',
    ':lang(en)',
    ':link',
    ':any-link',
    ':target',
    ':required',
    ':optional',
    ':read-write',
    ':read-only',
    ':empty',
    ':root',
    ':placeholder-shown',
    ':indeterminate',
    ':defined',
    ':valid',
    ':invalid',
    ':default',
    ':open',
    ':closed',
    ':modal',
  ]

  test('the legacy path answers what the ordinary path answers', () => {
    // Compared against this engine on a modern host rather than against
    // jsdom, because the two disagree about a few of these on any host: a
    // disabled control is barred from constraint validation, so it does not
    // match ':valid' here and does there. What this test is for is whether
    // the legacy reads change an answer, and they must not.
    const legacy = build(FORM)
    const modern = buildModern(FORM)
    expect(legacy.NW.configure()['LEGACY']).toBe(true)
    expect(modern.NW.configure()['LEGACY']).toBe(false)

    for (const selector of PSEUDOS) {
      let mine
      expect(() => {
        mine = ids(legacy.NW.select(selector, legacy.host))
      }, selector).not.toThrow()
      expect(mine, selector).toEqual(
        ids(modern.NW.select(selector, modern.document)),
      )
    }
  })

  // Keep the original aggregate's assertions. These three failures also
  // occur in modern mode on master and belong to #190 and #193.
  for (const selector of [
    ':disabled',
    ':enabled',
    ':checked',
    ':lang(en)',
    ':link',
    ':any-link',
    ':target',
    ':empty',
    ':root',
    ':defined',
    ':optional',
  ] as const) {
    test(selector + ' agrees with the independent reference', () => {
      const { NW, host, document } = build(FORM)
      expect(ids(NW.select(selector, host)), selector).toEqual(
        ids(document.querySelectorAll(selector)),
      )
    })
  }
})

import './legacy-attribute.cases.mts'
