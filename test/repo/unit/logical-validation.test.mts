import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi, type TestContext } from 'vitest'
import factory from '../../../src/nwsapi.js'

function fixture(t: TestContext) {
  const { window } = new JSDOM('<!doctype html><div id="parent"></div>')
  t.onTestFinished(() => window.close())
  return { document: window.document, nw: factory(window) }
}

for (const selector of [
  'div:not(span :unknown)',
  'div:not(span, :unknown)',
  'div:has(:unknown)',
  'div:has(:\\75 nknown)',
  'div:has(> :unknown)',
  'div:has(+ :unknown)',
  'div:has(:not(span :unknown))',
  'span:has(:unknown)',
  'div:matches(span :unknown)',
  'div:has(:-nwsapi-anchor)',
  'div:has(:unknown:is(span))',
  'div:not(span :unknown:where(div))',
  'div:unknown:is(div)',
] as const) {
  test(`validates ${selector} before visiting candidates`, t => {
    const { document, nw } = fixture(t)
    const empty = document.createElement('section')
    const childless = document.getElementById('parent')
    const detached = document.createElement('div')
    const contexts = [
      empty,
      document.createDocumentFragment(),
      document.implementation.createHTMLDocument(''),
      document,
    ]
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const context of contexts) {
        assert.throws(() => nw.select(selector, context), {
          name: 'SyntaxError',
        })
        assert.throws(() => nw.first(selector, context), {
          name: 'SyntaxError',
        })
      }
      for (const element of [childless, detached] as const) {
        assert.throws(() => nw.match(selector, element!), {
          name: 'SyntaxError',
        })
      }
    }
  })
}

test('forgiving lists discard invalid nested items and retain valid alternatives', t => {
  const { document, nw } = fixture(t)
  const parent = document.getElementById('parent')
  const empty = document.createElement('section')
  for (const pseudo of ['is', 'where'] as const) {
    for (const invalid of [
      ':unknown',
      ':not(span :unknown)',
      ':has(:unknown)',
      ':has(:unknown:is(span))',
    ] as const) {
      const selector = `div:${pseudo}(${invalid}, #parent)`
      for (let repeat = 0; repeat < 2; repeat++) {
        assert.deepEqual(nw.select(selector, empty), [])
        assert.deepEqual(nw.select(selector, document), [parent])
        assert.equal(nw.match(selector, parent!), true)
      }
    }
    nw.configure({ FORGIVING: false })
    assert.throws(() => nw.select(`div:${pseudo}(:unknown, #parent)`, empty), {
      name: 'SyntaxError',
    })
    nw.configure({ FORGIVING: true })
  }
})

test('quoted pseudo text and valid relative selectors retain context and cache behavior', t => {
  const { document, nw } = fixture(t)
  const parent = document.getElementById('parent')
  parent!.innerHTML = '<span data-value=":unknown, :-nwsapi-anchor"></span>'
  const empty = document.createElement('section')
  for (const selector of [
    'div:has(> [data-value=":unknown, :-nwsapi-anchor"])',
    'div:not(span [data-value=":unknown"])',
    'div:has(:is(:unknown, span))',
    'div:has(:where(:unknown, span))',
  ] as const) {
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(nw.select(selector, empty), [])
      assert.deepEqual(nw.select(selector, document), [parent])
      assert.equal(nw.match(selector, parent!), true)
    }
  }
  assert.deepEqual(nw.select(':scope:has(> span) > span', parent!), [
    parent!.firstChild,
  ])
})

test('quiet validation does not turn invalid negations into matches or poison verbose caches', t => {
  const { document, nw } = fixture(t)
  const parent = document.getElementById('parent')
  const empty = document.createElement('section')
  for (const selector of [
    'div:not(span :unknown)',
    'div:has(:unknown)',
  ] as const) {
    for (let repeat = 0; repeat < 2; repeat++) {
      nw.configure({ VERBOSITY: false, LOGERRORS: false })
      assert.deepEqual(nw.select(selector, empty), [])
      assert.deepEqual(nw.select(selector, document), [])
      assert.equal(nw.match(selector, parent!), false)
      nw.configure({ VERBOSITY: true })
      assert.throws(() => nw.select(selector, empty), { name: 'SyntaxError' })
      assert.throws(() => nw.match(selector, parent!), { name: 'SyntaxError' })
    }
  }
})

test('quiet validation retains configured error logging', t => {
  const { document, nw } = fixture(t)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  nw.configure({ VERBOSITY: false, LOGERRORS: true })
  assert.deepEqual(
    nw.select('div:has(:unknown)', document.createElement('div')),
    [],
  )
  assert.equal(log.mock.calls.length, 1)
  assert.match(log.mock.calls[0]![0], /unknown pseudo-class/)
})

test('validation isolates extension variables, preserves modes, and does not run DOM matchers', t => {
  const { document, nw } = fixture(t)
  const parent = document.getElementById('parent')
  parent!.innerHTML = '<span></span>'
  const modes: Array<[string, boolean | null]> = []
  nw.registerSelector('probe', /^:(outer|inner)(.*)/, (match, source, mode) => {
    const name = match[1]!
    modes.push([name, mode])
    return {
      source: `if((${name}=true)){${source}}`,
      modvar: name,
      status: true,
    }
  })
  const snapshot = Reflect.get(nw, 'Snapshot')
  const has = vi.spyOn(snapshot, 'has')
  const match = vi.spyOn(snapshot, 'match')
  for (const legacy of [false, true] as const) {
    nw.configure({ LEGACY: legacy }, true)
    modes.length = 0
    has.mockClear()
    match.mockClear()
    const selector = 'div#parent:outer:has(> span:inner)'
    const resolver = nw.compile(selector, false, false)
    assert.deepEqual(modes, [
      ['outer', false],
      ['inner', true],
    ])
    assert.equal(has.mock.calls.length, 0)
    assert.equal(match.mock.calls.length, 0)
    assert.match(String(resolver), /,outer/)
    assert.doesNotMatch(String(resolver), /,inner/)
    assert.equal(nw.match(selector, parent!), true)
    assert.deepEqual(nw.select(selector, document), [parent])
  }
})
