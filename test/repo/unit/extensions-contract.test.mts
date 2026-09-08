import type * as NwsapiModule from '../../../src/nwsapi.js'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { expect, test, vi, type TestContext } from 'vitest'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js') as typeof NwsapiModule.default

function fixture(t: TestContext) {
  const { window } = new JSDOM(
    '<main><p data-score="2"></p><p data-score="3"></p><i></i></main>',
  )
  t.onTestFinished(() => window.close())
  return { window, engine: factory(window), doc: window.document }
}

test('selector extensions declare local variables in both resolver modes and compose with built-ins', t => {
  const { engine, doc } = fixture(t)
  const pattern = /^:score\((\d+)\)(.*)/
  engine.registerSelector('score', pattern, (match, source) => ({
    match,
    modvar: 'score',
    status: true,
    source: `score=Number(e.getAttribute("data-score"));if(score===${Number(match[1])}){${source}}`,
  }))
  // A duplicate registration must preserve the original extension.
  engine.registerSelector('score', pattern, () => {
    throw Error('replaced')
  })
  const first = doc.querySelector('p')
  for (const legacy of [false, true, false] as const) {
    engine.configure({ LEGACY: legacy })
    for (const selector of [
      'p:score(2)',
      ':score(2)[data-score]',
      ':score(2):not(i)',
    ] as const) {
      expect(engine.select(selector, doc)).toEqual([first])
      expect(engine.match(selector, first!)).toBe(true)
      expect(engine.match(selector, first!.nextElementSibling!)).toBe(false)
      const seen: Element[] = []
      expect(engine.first(selector, doc, node => seen.push(node))).toBe(first)
      expect(seen).toEqual([first])
    }
  }
})

test('custom combinators and operators reject duplicate registrations without changing semantics', t => {
  const { engine, doc } = fixture(t)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  // A custom identity combinator retains the selected candidates.
  engine.registerCombinator('!', () => '')
  expect(engine.select('p!p', doc)).toEqual(
    Array.from(doc.querySelectorAll('p')),
  )
  engine.registerCombinator('!', () => {
    throw Error('duplicate')
  })
  engine.registerOperator('!=', { p1: 'n!="', p2: '"', p3: 'true' })
  Reflect.apply(Reflect.get(engine, 'registerOperator'), engine, ['!=', {}])
  expect(warning).toHaveBeenCalledTimes(2)
})

test('configuration getters and quiet validation preserve public return contracts', t => {
  const { engine, doc } = fixture(t)
  expect(engine.configure()).toBe(engine.Config)
  expect(engine.configure('LEGACY')).toBe(false)
  expect(engine.configure('missing')).toBe(false)
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  for (const selector of [
    '',
    '1',
    'p,',
    ':unknown',
    '::slotted()',
    '::slotted(p > i)',
    ':has()',
    ':not()',
    ':nth-child()',
  ] as const) {
    expect(engine.select(selector, doc).length, selector).toBe(0)
    expect(engine.match(selector, doc.body), selector).toBe(false)
  }
  expect(factory.DOMSelector).toBe(require('../../../src/dom-selector.js'))
})

test('quiet compiler validation drops invalid strict logical and slotted arguments', t => {
  const { engine, doc } = fixture(t)
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  for (const selector of [
    ':not(:unknown)',
    ':matches(:unknown)',
    ':has(:unknown)',
    '::slotted(:unknown)',
    ':not(p >)',
    ':has(p || p)',
  ] as const) {
    expect(engine.select(selector, doc).length, selector).toBe(0)
    expect(engine.match(selector, doc.body), selector).toBe(false)
  }
  engine.registerSelector('declined', /^:declined(.*)/, (_match, source) => ({
    source,
    status: false,
  }))
  expect(engine.select(':declined', doc)).toEqual([])
})

test('custom operators compose with logical selectors and observe mutations after compilation', t => {
  const { engine, doc } = fixture(t)
  engine.registerOperator('!=', { p1: '^', p2: '$', p3: 'false' })
  const nodes = Array.from(doc.getElementsByTagName('p'))
  for (const legacy of [false, true] as const) {
    engine.configure({ LEGACY: legacy })
    nodes[0]!.setAttribute('data-score', '2')
    for (const selector of [
      'p[data-score!="2"]',
      'p:is([data-score!="2"])',
    ] as const) {
      expect(engine.select(selector, doc)).toEqual([nodes[1]])
      expect(engine.match(selector, nodes[0]!)).toBe(false)
      expect(engine.match(selector, nodes[1]!)).toBe(true)
      expect(engine.first(selector, doc)).toBe(nodes[1])
    }
    nodes[0]!.setAttribute('data-score', '4')
    expect(engine.select('p[data-score!="2"]', doc)).toEqual(nodes)
    expect(engine.match('p[data-score!="2"]', nodes[0]!)).toBe(true)
  }
})

test('selector extensions preserve callback termination and cached resolver behavior', t => {
  const { engine, doc } = fixture(t)
  engine.registerSelector('scored', /^:scored(.*)/, (match, source) => ({
    match,
    status: true,
    source: `if(e.hasAttribute("data-score")){${source}}`,
  }))
  const nodes = Array.from(doc.getElementsByTagName('p'))
  for (const selector of ['p:scored', 'p', 'p[data-score]'] as const) {
    for (let run = 0; run < 2; run++) {
      const seen: Element[] = []
      const result = engine.select(selector, doc, node => {
        seen.push(node)
        return false
      })
      expect(result.length).toBe(1)
      expect(result[0]).toBe(nodes[0])
      expect(seen.length).toBe(1)
      expect(seen[0]).toBe(nodes[0])
    }
  }
  expect(engine.select('p:scored', doc)).toEqual(nodes)
  nodes[0]!.removeAttribute('data-score')
  expect(engine.select('p:scored', doc)).toEqual([nodes[1]])
  expect(engine.match('p:scored', nodes[0]!)).toBe(false)
})

test('byId distinguishes the legacy document.all length property from an element ID', t => {
  const { engine, doc } = fixture(t)
  const node = doc.getElementsByTagName('p')[0]
  node!.id = 'length'
  Object.defineProperty(doc, 'all', { value: { length: 4 } })
  expect(engine.byId('length', doc)).toEqual([node])
  node!.removeAttribute('id')
  expect(engine.byId('length', doc)).toEqual([])
})
