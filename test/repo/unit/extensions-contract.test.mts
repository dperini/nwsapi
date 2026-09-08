import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js')

function fixture(t) {
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
  for (const legacy of [false, true, false]) {
    engine.configure({ LEGACY: legacy })
    for (const selector of [
      'p:score(2)',
      ':score(2)[data-score]',
      ':score(2):not(i)',
    ]) {
      expect(engine.select(selector, doc)).toEqual([first])
      expect(engine.match(selector, first)).toBe(true)
      expect(engine.match(selector, first.nextElementSibling)).toBe(false)
      const seen = []
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
  engine.registerOperator('!=', {})
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
  ]) {
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
  ]) {
    expect(engine.select(selector, doc).length, selector).toBe(0)
    expect(engine.match(selector, doc.body), selector).toBe(false)
  }
  engine.registerSelector('declined', /^:declined(.*)/, (_match, source) => ({
    source,
    status: false,
  }))
  expect(engine.select(':declined', doc)).toEqual([])
})
