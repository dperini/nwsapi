import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

function fixture(t) {
  const { window } = new JSDOM(
    '<div><ul><li><a id=a></a></li></ul></div><section id=s><a id=b></a></section>',
  )
  t.onTestFinished(() => window.close())
  return {
    document: window.document,
    nw: factory(window),
  }
}

test('the filter stops unproductive sampling and retries later', t => {
  const { document, nw } = fixture(t)
  const state = { seen: 0, kept: 0, rest: 0 }
  const target = document.getElementById('a')
  for (let i = 0; i < 64; i++) {
    assert.equal(Reflect.get(nw, 'Snapshot').mayMatch(target, 0, state), true)
  }
  assert.equal(state.rest, 4096)
  for (let i = 0; i < 4096; i++) {
    assert.equal(Reflect.get(nw, 'Snapshot').mayMatch(target, 0, state), true)
  }
  assert.deepEqual(state, { seen: 0, kept: 0, rest: 0 })
  Reflect.get(nw, 'Snapshot').mayMatch(target, 0, state)
  assert.equal(state.seen, 1)
})

test('each compiled resolver owns its adaptive counters', t => {
  const { document, nw } = fixture(t)
  const first = nw.compile('div ul li a', true)
  const second = nw.compile('body div ul a', true)
  assert.match(first.toString(), /s\.mayMatch\(e,\d+,a\)/)
  assert.match(second.toString(), /s\.mayMatch\(e,\d+,a\)/)
  assert.deepEqual(
    (
      first([document.getElementById('a')], null, document, []) as Element[]
    ).map(e => e.id),
    ['a'],
  )
})

test('negated tags do not become required ancestor tags', t => {
  const { document, nw } = fixture(t)
  const resolver = nw.compile('div ul a:not(article)', true)!
  assert.match(resolver.toString(), /s\.mayMatch\(/)
  assert.deepEqual(
    nw.select('div ul a:not(article)', document).map(element => element.id),
    ['a'],
  )
})

test('sibling tags do not become required ancestor tags', t => {
  const { document, nw } = fixture(t)
  document.querySelector('ul').before(document.createElement('article'))
  for (const selector of [
    'div article + ul a',
    'div article ~ ul a',
    'div article + ul > li a',
  ]) {
    assert.deepEqual(
      nw.select(selector, document).map(e => e.id),
      ['a'],
      selector,
    )
  }
})

test('nested logical validation cannot replace outer ancestor requirements', t => {
  const { document, nw } = fixture(t)
  document.getElementById('a').innerHTML = '<span><em></em></span>'
  nw.configure({ FORGIVING: false })
  for (const selector of [
    'div ul a:has(span em)',
    'div ul a:not(article section p)',
    'div ul a:is(a, section article a)',
    'div ul a:where(a, section article a)',
    'div ul a:matches(a, section article a)',
    'div ul a:not(:has(article section p))',
  ]) {
    assert.deepEqual(
      nw.select(selector, document).map(e => e.id),
      ['a'],
      selector,
    )
  }
})

test('callbacks may move a previously summarized subtree before later candidates', t => {
  const { document, nw } = fixture(t)
  const section = document.getElementById('s')
  const rejected = document.createElement('a')
  section.prepend(rejected)
  const candidates = [
    rejected,
    document.getElementById('a'),
    document.getElementById('b'),
  ]
  const run = nw.compile('div ul a', true, true)
  const results = run(
    candidates,
    element => {
      if (element.id === 'a') {
        document.querySelector('ul').append(section)
      }
      return false
    },
    document,
    [],
  ) as Element[]
  assert.deepEqual(
    results.map(e => e.id),
    ['a', 'b'],
  )
})

test('filtering preserves results across movement and document changes', t => {
  const { document, nw } = fixture(t)
  for (const selector of [
    'div ul li a',
    'body div a',
    'body section a',
    'div > ul > li > a',
  ]) {
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(
        nw.select(selector, document).map(e => e.id),
        Array.from(document.querySelectorAll(selector), (e: Element) => e.id),
      )
    }
  }
  document.querySelector('li').append(document.getElementById('b'))
  assert.deepEqual(
    nw.select('div ul li a', document).map(e => e.id),
    ['a', 'b'],
  )
  const other = document.implementation.createHTMLDocument('other')
  other.body.innerHTML = '<div><ul><li><a id=c></a></li></ul></div>'
  assert.deepEqual(
    nw.select('div ul li a', other).map(e => e.id),
    ['c'],
  )
})

test('filtering preserves HTML and XML tag comparisons', t => {
  const { document, nw } = fixture(t)
  assert.deepEqual(
    nw.select('div ul a', document).map(e => e.id),
    ['a'],
  )
  const { window } = new JSDOM(
    '<Root><DIV><UL><A id="upper"/></UL></DIV><div><ul><A id="lower"/></ul></div></Root>',
    { contentType: 'application/xml' },
  )
  t.onTestFinished(() => window.close())
  const xml = factory(window)
  for (const [selector, expected] of [
    ['Root DIV UL A', ['upper']],
    ['Root div ul A', ['lower']],
    ['Root DIV ul A', []],
  ] as const) {
    assert.deepEqual(
      xml.select(selector, window.document).map(e => e.id),
      expected,
    )
  }
})

test('hash collisions only admit candidates for full matching', t => {
  const { document, nw } = fixture(t)
  const bit = name => {
    let hash = 0
    for (const char of name) {
      hash = (hash * 31 + char.charCodeAt(0)) | 0
    }
    return 1 << (hash & 31)
  }
  const collision = name => {
    for (let i = 0; ; i++) {
      const candidate = 'x-collision-' + i
      if (bit(candidate) === bit(name)) {
        return candidate
      }
    }
  }
  const outer = document.createElement(collision('div'))
  const inner = document.createElement(collision('ul'))
  const candidate = document.createElement('a')
  document.body.append(outer)
  outer.append(inner)
  inner.append(candidate)
  const snapshot = Reflect.get(nw, 'Snapshot')
  assert.equal(
    snapshot.mayMatch(candidate, bit('div') | bit('ul'), {
      seen: 0,
      kept: 0,
      rest: 0,
    }),
    true,
  )
  snapshot.clearAncestorMasks()
  assert.deepEqual(
    nw.compile('div ul a', true)([candidate], null, document, []),
    [],
  )
})

test('nested selection does not leak summaries across resolvers', t => {
  const { document, nw } = fixture(t)
  const snapshot = Reflect.get(nw, 'Snapshot')
  const original = snapshot.mayMatch
  let nested = false
  snapshot.mayMatch = (node, mask, state) => {
    if (!nested) {
      nested = true
      assert.deepEqual(
        nw.select('body section a', document).map(e => e.id),
        ['b'],
      )
    }
    return original(node, mask, state)
  }
  assert.deepEqual(
    nw.select('div ul li a', document).map(e => e.id),
    ['a'],
  )
})

test('adaptive counters are isolated and expire with evicted resolvers', t => {
  const { document, nw } = fixture(t)
  const states = []
  const original = Reflect.get(nw, 'Snapshot').mayMatch
  Reflect.get(nw, 'Snapshot').mayMatch = (node, mask, state) => {
    states.push(state)
    return original(node, mask, state)
  }
  const run = selector =>
    nw.compile(selector, true)(
      [document.getElementById('a')],
      null,
      document,
      [],
    )
  run('div ul li a')
  run('body div ul a')
  assert.notEqual(states[0], states[1])
  run('div ul li a')
  assert.equal(states[0], states[2])
  for (let i = 0; i < 5000; i++) {
    nw.compile('div ul li .unused-' + i, true)
  }
  run('div ul li a')
  assert.notEqual(states[0], states[3])
})

test('legacy mode bypasses the ancestor filter', t => {
  const { document, nw } = fixture(t)
  nw.configure({ LEGACY: true }, true)
  Reflect.get(nw, 'Snapshot').mayMatch = () => {
    throw Error('legacy filter')
  }
  assert.deepEqual(
    nw.select('div ul li a', document).map(e => e.id),
    ['a'],
  )
})

test('throwing callbacks do not retain stale ancestor summaries', t => {
  const { document, nw } = fixture(t)
  const run = nw.compile('div ul a', true, true)
  assert.throws(
    () =>
      run(
        [document.getElementById('b'), document.getElementById('a')],
        () => {
          throw Error('stop')
        },
        document,
        [],
      ),
    /stop/,
  )
  document.querySelector('ul').append(document.getElementById('s'))
  assert.deepEqual(
    nw.select('div ul a', document).map(e => e.id),
    ['a', 'b'],
  )
})
