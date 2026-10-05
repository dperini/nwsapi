import assert from 'node:assert/strict'
import { test } from 'vitest'
import { JSDOM } from 'jsdom'
import { selectCandidates } from '../../../src/core/select/candidates.mts'
import factory from '../../../dist/nwsapi.js'
import type {
  EngineState,
  EngineContext,
} from '../../../src/core/state/types.mts'

function markup() {
  return (
    '<!doctype html><body>' +
    Array.from(
      { length: 80 },
      (_, index) =>
        `<p class="candidate${index % 2 ? ' hit' : ''}" data-hit="${index % 2 ? 'yes' : 'no'}"></p>`,
    ).join('') +
    '</body>'
  )
}

test('filtered tag and class results stay isolated and refresh after mutation', t => {
  const { window } = new JSDOM(markup())
  t.onTestFinished(() => window.close())
  const document = window.document
  const engine = factory(window)

  for (const selector of ['p[data-hit="yes"]', '.hit[data-hit="yes"]']) {
    const expected = Array.from(document.querySelectorAll(selector))
    const first = engine.select(selector, document) as Element[]
    const second = engine.select(selector, document) as Element[]
    assert.equal(expected.length, selector.startsWith('.') ? 38 : 40)
    assert.notEqual(first, second)
    assert.deepEqual(first, expected)
    first.pop()
    assert.deepEqual(second, expected)

    expected[0]!.setAttribute('data-hit', 'no')
    expected[1]!.remove()
    assert.deepEqual(
      Array.from(engine.select(selector, document)),
      Array.from(document.querySelectorAll(selector)),
    )
  }
})

test('callbacks preserve the borrowed candidate traversal during reentry', t => {
  const { window } = new JSDOM(markup())
  t.onTestFinished(() => window.close())
  const document = window.document
  const engine = factory(window)
  const expected = Array.from(document.querySelectorAll('p[data-hit="yes"]'))
  const visited: Element[] = []
  let reentered = false

  engine.select('p[data-hit="yes"]', document, element => {
    visited.push(element)
    if (!reentered) {
      reentered = true
      expected[1]!.setAttribute('data-hit', 'no')
      assert.equal(
        engine.select('p[data-hit="yes"]', document).length,
        expected.length - 1,
      )
    }
  })

  assert.deepEqual(visited, expected)
  assert.equal(
    engine.select('p[data-hit="yes"]', document).length,
    expected.length - 1,
  )
})

test('NODE_LIST, XML, fragments, and identity lookup keep fallback parity', t => {
  const { window } = new JSDOM(markup())
  t.onTestFinished(() => window.close())
  const document = window.document
  const engine = factory(window)
  const candidates = Array.from(document.querySelectorAll('p.hit'))
  const fragment = document.createDocumentFragment()
  for (const candidate of candidates) {
    fragment.append(candidate.cloneNode(true))
  }
  const xml = new window.DOMParser().parseFromString(
    '<root>' + '<item class="hit"/>'.repeat(80) + '</root>',
    'application/xml',
  )

  engine.configure({ NODE_LIST: true })
  const nodeList = engine.select(
    '.hit[data-hit="yes"]',
    document,
  ) as NodeListOf<Element>
  assert.equal(nodeList.length, 40)
  assert.equal(nodeList.item(0), nodeList[0])
  assert.deepEqual(
    Array.from(engine.select('.hit[data-hit="yes"]', fragment)),
    Array.from(fragment.querySelectorAll('.hit[data-hit="yes"]')),
  )
  assert.deepEqual(
    Array.from(engine.select('item.hit', xml.documentElement)),
    Array.from(xml.querySelectorAll('item.hit')),
  )
  const identityFirst = engine.select('p', document) as NodeListOf<Element>
  const identitySecond = engine.select('p', document) as NodeListOf<Element>
  assert.notEqual(identityFirst, identitySecond)
  assert.equal(identityFirst.length, 80)
})

test('filtered candidates borrow the snapshot path while identity candidates fetch', () => {
  const context = {} as EngineContext
  const calls: string[] = []
  const candidates = [] as Element[]
  const engine = {
    Config: { LEGACY: false },
    Selectors: {},
    Combinators: {},
    hasCandidates(token: string) {
      calls.push('snapshot:' + token)
      return candidates
    },
    fetch: {
      '*': (name: string) => {
        calls.push('fetch:' + name)
        return candidates
      },
    },
  } as unknown as EngineState

  assert.equal(selectCandidates(engine, '*', context, true), candidates)
  assert.equal(selectCandidates(engine, '*', context, false), candidates)
  assert.deepEqual(calls, ['snapshot:*', 'fetch:'])
  engine.Selectors[''] = {
    Expression: /^:custom(.*)/,
    Callback: (match, source) => ({ match, source, status: true }),
  }
  selectCandidates(engine, '*', context, true)
  assert.equal(calls.at(-1), 'fetch:')
})
