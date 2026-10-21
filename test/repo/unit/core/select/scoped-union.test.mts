import { JSDOM, type DOMWindow } from 'jsdom'
import { afterEach, expect, test, vi } from 'vitest'
import factory from '../../../../../dist/nwsapi.js'
import { initializeApi } from '../../../../../src/core/initialize/api.mts'
import { initializeMatching } from '../../../../../src/core/initialize/matching.mts'
import { initializeRuntime } from '../../../../../src/core/initialize/runtime.mts'
import { selectTypeUnion } from '../../../../../src/core/select/all.mts'
import {
  appendUnionPair,
  outerRoots,
  selectUnionPairRoots,
  selectScopedTypeUnion,
  selectUnionRoot,
  selectUnionRoots,
  splitUnionTypes,
} from '../../../../../src/core/select/scoped-union.mts'
import { createState } from '../../../../../src/core/state/create.mts'
import type {
  EngineGlobal,
  EngineState,
} from '../../../../../src/core/state/types.mts'
import { registerLegacy } from '../../../common/legacy.mts'

const windows: DOMWindow[] = []
const selector = 'dl dd :is(a, code)'
afterEach(() => {
  vi.restoreAllMocks()
  for (const window of windows.splice(0)) {
    window.close()
  }
})

function fixture(html: string, doctype = '<!doctype html>') {
  const { window } = new JSDOM(doctype + html)
  windows.push(window)
  const engine = createState(
    window as unknown as EngineGlobal,
    factory as unknown as EngineState['Factory'],
  )
  initializeRuntime(engine)
  initializeMatching(engine)
  initializeApi(engine)
  engine.initialize(engine.doc)
  return {
    engine,
    window,
    document: window.document,
    nw: registerLegacy(factory(window)),
  }
}

function scoped(engine: EngineState, document: Document) {
  return selectScopedTypeUnion(
    engine,
    selector,
    'dl dd',
    ['a', 'code'],
    document,
  )
}

test('union types normalize comma whitespace and keep first occurrence order', () => {
  expect(splitUnionTypes('a, code')).toEqual(['a', 'code'])
  expect(splitUnionTypes('a, a')).toEqual(['a'])
  expect(splitUnionTypes('code\t,\na,\fcode,\rpre, a')).toEqual([
    'code',
    'a',
    'pre',
  ])
})

test('outer roots remove nested and repeated scopes without dropping siblings', () => {
  const { document } = fixture(
    '<dl><dd id="outer"><dl><dd id="inner"></dd></dl></dd><dd id="sibling"></dd></dl>',
  )
  const [outer, inner, sibling] = [...document.querySelectorAll('dd')]
  expect(outerRoots([outer!, inner!, inner!, sibling!])).toEqual([
    outer,
    sibling,
  ])
  expect(outerRoots([])).toEqual([])
})

test('scoped unions fetch the prefix once and merge ordered non-overlapping tag runs', () => {
  const { engine, document } = fixture(
    '<dl><dd><code id="first"></code><dl><dd><a id="second"></a></dd></dl>' +
      '<a id="third"></a></dd><dd><code id="last"></code></dd></dl>',
  )
  const descend = vi.spyOn(engine, 'descendChain')
  const fetch = vi.spyOn(engine, 'fetchLevel')
  const expected = [...document.querySelectorAll(selector)]
  expect(scoped(engine, document)).toEqual(expected)
  expect(expected.map(element => element.id)).toEqual([
    'first',
    'second',
    'third',
    'last',
  ])
  expect(descend).toHaveBeenCalledTimes(1)
  const terminalCalls = fetch.mock.calls.filter(([part]) =>
    ['a', 'code'].includes(part.tag!),
  )
  expect(terminalCalls).toHaveLength(4)
  expect(terminalCalls.every(([, root]) => root !== document)).toBe(true)
})

test('several terminal types and overlapping selector groups keep document order', () => {
  const { document, nw } = fixture(
    '<section class="scope"><p></p><code></code><section class="scope"><a></a><pre></pre></section><p></p></section>',
  )
  for (const query of [
    'section.scope :is(pre, a, p, code, p)',
    'section.scope :where(pre, a, p, code), section.scope p',
    'section :is(code, a, p, pre)',
  ]) {
    expect(nw.select(query, document)).toEqual([
      ...document.querySelectorAll(query),
    ])
  }
})

test('root-local unions merge only within each disjoint subtree and keep returned arrays private', () => {
  const { engine, document } = fixture(
    '<section><code id="one"></code><a id="two"></a></section>' +
      '<section><a id="three"></a></section><section></section>',
  )
  const roots = [...document.querySelectorAll('section')]
  const tags = ['a', 'code']
  const expected = [...document.querySelectorAll('a, code')]
  const merge = vi.spyOn(engine, 'mergeResults')
  expect(selectUnionRoots(engine, [], tags)).toEqual([])
  expect(selectUnionRoot(engine, roots[2]!, tags)).toEqual([])
  expect(selectUnionRoots(engine, roots, tags)).toEqual(expected)
  expect(merge).not.toHaveBeenCalled()
  const single = selectUnionRoots(engine, [roots[0]!], tags)
  expect(single).toEqual(expected.slice(0, 2))
  single.reverse()
  expect(selectUnionRoot(engine, roots[0]!, tags)).toEqual(expected.slice(0, 2))
  roots[0]!.firstElementChild!.remove()
  roots[1]!.append(document.createElement('code'))
  expect(selectUnionRoots(engine, roots, tags)).toEqual([
    ...document.querySelectorAll('a, code'),
  ])
})

test('distinct type pairs append directly in either order across empty and interleaved roots', () => {
  const { engine, document } = fixture(
    '<section></section><section><a></a><a></a></section>' +
      '<section><code></code></section><section><code></code><a></a></section>' +
      '<section><a></a><code></code><a></a><code></code><a></a></section>',
  )
  const roots = [...document.querySelectorAll('section')]
  const expected = [...document.querySelectorAll('a, code')]
  for (const [first, second] of [
    ['a', 'code'],
    ['code', 'a'],
  ]) {
    expect(selectUnionPairRoots(engine, roots, first!, second!)).toEqual(
      expected,
    )
    const out = [document.body]
    const result = appendUnionPair(
      engine,
      { tag: first!, cls: undefined },
      { tag: second!, cls: undefined },
      roots[4]!,
      out,
    )
    expect(result).toBe(out)
    expect(result).toEqual([
      document.body,
      ...roots[4]!.querySelectorAll('a, code'),
    ])
  }
})

test('route counts never become cached answers after removal, insertion, or widening', () => {
  const { engine, document, nw } = fixture(
    '<dl><dd><a></a><code></code></dd></dl>',
  )
  expect(scoped(engine, document)).toHaveLength(2)
  document.querySelector('dd')!.innerHTML = ''
  expect(scoped(engine, document)).toEqual([])
  document.querySelector('dd')!.innerHTML = '<code></code><a></a>'
  expect(scoped(engine, document)).toEqual([
    ...document.querySelectorAll(selector),
  ])
  document.body.innerHTML = '<dl><dd><a></a><code></code></dd></dl>'.repeat(
    engine.DESCENT_PROBE + 1,
  )
  expect(scoped(engine, document)).toBeNull()
  expect(engine.descentDeclined.get(selector)).toBe(true)
  expect(nw.select(selector, document)).toEqual([
    ...document.querySelectorAll(selector),
  ])
})

test('declined empty and wide shapes still discover later matches through the public API', () => {
  for (const width of [1, 150]) {
    const { engine, document, nw } = fixture('<dl><dd></dd></dl>'.repeat(width))
    expect(scoped(engine, document)).toBeNull()
    expect(nw.select(selector, document)).toEqual([])
    document.querySelector('dd')!.innerHTML = '<code id="late"></code><a></a>'
    expect(nw.select(selector, document)).toEqual([
      ...document.querySelectorAll(selector),
    ])
    document.body.innerHTML = '<dl><dd><a id="replacement"></a></dd></dl>'
    expect(nw.select(selector, document)).toEqual([
      ...document.querySelectorAll(selector),
    ])
  }
})

test('unions retain empty branches, whitespace, callbacks, first, and list output', () => {
  const { document, window, nw } = fixture(
    '<dl><dd><code id="first"></code><code id="second"></code></dd></dl>',
  )
  const expected = [...document.querySelectorAll('code')]
  for (const query of [selector, 'dl dd :where(a,\tcode,\ncode, a)']) {
    expect(nw.select(query, document)).toEqual(expected)
    expect(nw.first(query, document)).toBe(expected[0])
    const seen: Element[] = []
    expect(
      nw.select(query, document, element => {
        seen.push(element)
      }),
    ).toEqual(expected)
    expect(seen).toEqual(expected)
  }
  nw.configure({ NODE_LIST: true })
  const result = nw.select(selector, document)
  expect(result).toBeInstanceOf(window.NodeList)
  expect(Array.from(result)).toEqual(expected)
})

test('the union prefilter preserves the existing single coercion of selector objects', () => {
  const { document, engine } = fixture('<dl><dd><a></a><code></code></dd></dl>')
  let reads = 0
  const query = {
    toString() {
      return ++reads === 1 ? selector : 'body'
    },
  }
  expect(
    selectTypeUnion(engine, query as unknown as string, document, undefined),
  ).toEqual([...document.querySelectorAll(selector)])
  expect(reads).toBe(1)
})

test('element and fragment contexts and legacy mode keep the ordinary selector contract', () => {
  const { document, nw } = fixture('<dl><dd><a></a><code></code></dd></dl>')
  const expected = [...document.querySelectorAll(selector)]
  const scope = document.querySelector('dd')!
  expect(nw.select(selector, scope)).toEqual(expected)
  nw.configure({ LEGACY: true })
  expect(nw.select(selector, document)).toEqual(expected)
  nw.configure({ LEGACY: false })
  const fragment = document.createDocumentFragment()
  fragment.append(document.querySelector('dl')!)
  expect(nw.select(selector, fragment)).toEqual(expected)
})

test('quirks, extensions, and unsupported prefixes decline scoped execution', () => {
  const { engine, document } = fixture('<dl><dd><a></a><code></code></dd></dl>')
  engine.QUIRKS_MODE = true
  expect(scoped(engine, document)).toBeNull()
  engine.QUIRKS_MODE = false
  engine.hasExtensions = true
  expect(scoped(engine, document)).toBeNull()
  engine.hasExtensions = false
  expect(
    selectScopedTypeUnion(engine, selector, 'dl > dd', ['a', 'code'], document),
  ).toBeNull()
  expect(
    selectScopedTypeUnion(engine, selector, 'dl dd', ['a'], document),
  ).toBeNull()
})

test('foreign and quirks documents preserve tag and class matching', () => {
  for (const doctype of ['<!doctype html>', '']) {
    const { document, nw } = fixture(
      '<dl class="Card"><dd><a></a><code></code><svg><a id="svg"></a></svg></dd></dl>',
      doctype,
    )
    for (const query of [selector, 'dl.card dd :is(a, code)']) {
      expect(nw.select(query, document)).toEqual([
        ...document.querySelectorAll(query),
      ])
    }
  }
})
