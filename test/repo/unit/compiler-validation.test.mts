import type { EngineState } from '../../../src/core/state.d.ts'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { afterAll, expect, test } from 'vitest'
import type factory from '../../../dist/nwsapi.js'

const require = createRequire(import.meta.url)
const create = require('../../../dist/nwsapi.js') as typeof factory
const invalidWindow = new JSDOM('<p></p>').window
const invalidEngine = create(invalidWindow)
afterAll(() => invalidWindow.close())

for (const selector of [
  '??',
  '[a?=b]',
  '::part(tab)#extra',
  '::view-transition-group(foo.-1)',
  '::view-transition-group(foo.)',
  ':has(:has(*))',
  ':host()',
  ':lang()',
  ':not(::before)',
  ':nth-child()',
  ':nth-child(foo)',
  ':state()',
  ':unknown',
]) {
  test(`direct compilation rejects ${selector}`, () => {
    const window = invalidWindow
    const engine = invalidEngine
    expect(() => engine.compile(selector, true, false)).toThrow(
      window.DOMException,
    )
    expect(engine.select('p', window.document)).toHaveLength(1)
  })
}

test('relative resolver failures restore the anchor and do not poison later plans', t => {
  const { window } = new JSDOM('<div><span></span></div>')
  t.onTestFinished(() => window.close())
  const engine = create(window)
  const parent = window.document.querySelector('div')!
  const snapshot = engine.Snapshot
  const previous = snapshot.anchor
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  expect(snapshot.has([''], parent)).toBe(false)
  expect(snapshot.has(['??'], parent)).toBe(false)
  expect(snapshot.anchor).toBe(previous)
  expect(snapshot.has(['> span'], parent)).toBe(true)
  expect(snapshot.anchor).toBe(previous)
})

test('stable type positions support repeated candidates and reset between queries', t => {
  const { window } = new JSDOM('<div><i></i><span></span><i></i></div>')
  t.onTestFinished(() => window.close())
  const engine = create(window)
  const nodes = window.document.querySelectorAll('i')
  const nthOfType = Reflect.get(
    engine.Snapshot,
    'nthOfType',
  ) as EngineState['nthOfType']
  expect(nthOfType(nodes[0]!, 0, true)).toBe(1)
  expect(nthOfType(nodes[0]!, 0, true)).toBe(1)
  expect(nthOfType(nodes[1]!, 0, true)).toBe(2)
  expect(nthOfType(nodes[1]!, 1, true)).toBe(1)
  nthOfType(null, 2)
  nodes[0]!.remove()
  expect(nthOfType(nodes[1]!, 0, true)).toBe(1)
  nthOfType(null, 2)
})

test('closest switches documents and escaped CRLF terminators survive comments', t => {
  const source = new JSDOM('<p></p>')
  const target = new JSDOM('<section><p id=a class=hit><i></i></p></section>')
  t.onTestFinished(() => {
    source.window.close()
    target.window.close()
  })
  const engine = create(source.window)
  const document = target.window.document
  expect(engine.closest('p', document.querySelector('i')!)).toBe(
    document.querySelector('p'),
  )
  expect(engine.select('#\\61\r\n/**/.hit', document)).toEqual([
    document.querySelector('p'),
  ])
})

test('strict logical compilation rejects an unknown branch without poisoning later queries', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const engine = create(window)
  engine.configure({ FORGIVING: false, VERBOSITY: false, LOGERRORS: false })
  const resolver = engine.compile(':is(:unknown)', true, false)
  expect(resolver).toBeTypeOf('function')
  expect(
    resolver!([window.document.querySelector('p')!], null, window.document, []),
  ).toEqual([])
  expect(engine.select('p', window.document)).toHaveLength(1)
})

test('declined relative extensions fail quietly without poisoning later plans', t => {
  const { window } = new JSDOM('<div><span></span></div>')
  t.onTestFinished(() => window.close())
  const engine = create(window)
  const parent = window.document.querySelector('div')!
  engine.configure({ VERBOSITY: false, LOGERRORS: false })
  engine.registerSelector('declined', /^:declined(.*)/, (_match, source) => ({
    source,
    status: false,
  }))
  const anchor = engine.Snapshot.anchor
  expect(engine.Snapshot.has(['> span:declined'], parent)).toBe(false)
  expect(engine.Snapshot.anchor).toBe(anchor)
  expect(engine.Snapshot.has(['> span'], parent)).toBe(true)
  expect(engine.Snapshot.anchor).toBe(anchor)
})

test('explicit contenteditable false stops inherited editability', t => {
  const { window } = new JSDOM(
    '<section contenteditable=true><div contenteditable=false><span></span></div></section>',
  )
  t.onTestFinished(() => window.close())
  const engine = create(window)
  const doc = window.document
  const section = doc.querySelector('section')!
  const blocked = doc.querySelector('div')!
  const child = doc.querySelector('span')!
  expect(engine.match(':read-write', section)).toBe(true)
  expect(engine.match(':read-only', blocked)).toBe(true)
  expect(engine.match(':read-write', child)).toBe(false)
  blocked.removeAttribute('contenteditable')
  expect(engine.match(':read-write', child)).toBe(true)
})
