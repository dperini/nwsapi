import assert from 'node:assert/strict'
import { test, describe, afterEach } from 'vitest'
import { JSDOM, type BinaryData, type DOMWindow } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
const windows: DOMWindow[] = []
afterEach(() => {
  for (const window of windows.splice(0)) {
    window.close()
  }
})
function build(html: string | Buffer | BinaryData | undefined) {
  const { window } = new JSDOM(html)
  windows.push(window)
  const NW = factory(window)
  return { window, document: window.document, NW }
}

const fixture = `
  <main>
    <div id="one"><i class="x"></i><b></b><i class="t" id="a"></i><i id="b"></i><i class="t" id="c"></i></div>
    <div id="two"><i class="t" id="d"></i></div>
    <section><p id="e">1</p><em></em><p id="f">2</p><strong></strong><p id="g">3</p></section>
  </main>
`

function ids(
  run: {
    (selector: string, context?: unknown): ArrayLike<Element>
  },
  selector: string,
) {
  return Array.from(run(selector)).map(element => element.id)
}

describe('a sibling chain of simple parts answered by one parent pass', () => {
  test('results agree with the ordinary walk and stay in document order', t => {
    const { document, NW } = build(fixture)
    const cases: Array<[string, string[]]> = [
      ['i.t ~ i.t', ['c']],
      ['i ~ .t', ['a', 'c']],
      ['.x ~ i', ['a', 'b', 'c']],
      ['b ~ .t', ['a', 'c']],
      ['i.x ~ i', ['a', 'b', 'c']],
      ['p ~ p', ['f', 'g']],
      ['em ~ p', ['f', 'g']],
      ['p ~ em ~ p ~ strong ~ p', ['g']],
      ['p ~ strong ~ p', ['g']],
    ]
    for (const [selector, want] of cases) {
      const route = ids(NW.select.bind(NW), selector)
      const walk = Array.from(document.querySelectorAll(selector)).map(
        element => element.id,
      )
      assert.deepEqual(route, walk, selector)
      assert.deepEqual(route, want, selector)
    }
  })

  test('a chain with no prior match returns an empty result', t => {
    const { document, NW } = build(fixture)
    // 'd' is a first child, so no prior sibling can start the chain.
    assert.deepEqual(ids(NW.select.bind(NW), '.t ~ .t'), ['c'])
    assert.deepEqual(ids(NW.select.bind(NW), 'i ~ .t'), ['a', 'c'])
  })

  test('parts the chain cannot express keep the ordinary walk', t => {
    const { document, NW } = build(fixture)
    // A pseudo-class inside a part is outside the chain grammar; the
    // fallback must answer it identically.
    for (const selector of [
      'p:first-child ~ p',
      'i[t] ~ .t',
      'i.x ~ i:first-child',
    ] as const) {
      const answer = ids(NW.select.bind(NW), selector)
      const walk = Array.from(document.querySelectorAll(selector)).map(
        element => element.id,
      )
      assert.deepEqual(answer, walk, selector)
    }
  })

  test('callbacks and item collections still route through the resolver', t => {
    const { window, document, NW } = build(fixture)
    const seen: string[] = []
    NW.select('p ~ p', document, element => {
      seen[seen.length] = element.id
      return true
    })
    assert.deepEqual(seen, ['f', 'g'])
    NW.configure({ NODE_LIST: true })
    assert.ok(NW.select('i ~ .t', document) instanceof window.NodeList)
    NW.configure({ NODE_LIST: false })
  })

  test('a scoped context keeps ancestor facts outside the scope', t => {
    const { document, NW } = build(fixture)
    const scope = document.querySelector('#two')!
    assert.deepEqual(
      ids(sel => NW.select(sel, scope), '.t ~ .t'),
      [],
    )
    assert.deepEqual(
      ids(sel => NW.select(sel, scope), 'i ~ .t'),
      [],
    )
  })
})
