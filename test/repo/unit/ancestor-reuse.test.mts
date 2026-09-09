import assert from 'node:assert/strict'
import { test, vi, type TestContext } from 'vitest'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

function fixture(t: TestContext) {
  const { window } = new JSDOM(
    '<!doctype html><body>' +
      '<div class="box"><article><div class="block inner"><p id="a" class="content"></p></div>' +
      '<div class="block inner"><p id="b" class="content"></p></div></article></div>' +
      '<aside><article><div class="block inner"><p id="c" class="content"></p></div>' +
      '<div class="block inner"><p id="d" class="content"></p></div></article></aside></body>',
  )
  t.onTestFinished(() => window.close())
  return { document: window.document, nw: registerLegacy(factory(window)) }
}
const selector = '.box .block.inner > .content'

test('ancestor reuse preserves hits, misses, arbitrary candidate order and item collections', t => {
  const { document, nw } = fixture(t)
  const nodes = Array.from(document.querySelectorAll('.content'))
  const run = nw.compile(selector, true)!
  const input = [nodes[2], nodes[3], nodes[0], nodes[1], nodes[2], nodes[0]]
  assert.deepEqual(run(input, null, document, []), [
    nodes[0],
    nodes[1],
    nodes[0],
  ])
  assert.deepEqual(
    nw.compile(selector, null)!(
      document.querySelectorAll('.content'),
      null,
      document,
      [],
    ),
    nodes.slice(0, 2),
  )
  assert.equal(nw.first(selector, document), nodes[0])
  assert.deepEqual(
    nw.compile('* *', true)!(
      [null, nodes[0], null, nodes[1]],
      null,
      document,
      [],
    ),
    nodes.slice(0, 2),
  )
})

test('ancestor reuse avoids repeated prefix reads without adding persistent node caches', t => {
  const { document, nw } = fixture(t)
  const box = document.querySelector('.box')!
  let reads = 0
  Object.defineProperty(box, 'className', {
    configurable: true,
    get() {
      ++reads
      return 'box'
    },
  })
  const nodes = Array.from(document.querySelectorAll('.content')).slice(0, 2)
  const run = nw.compile(selector, true)!
  assert.deepEqual(run(nodes, null, document, []), nodes)
  assert.equal(reads, 1)
  run(nodes, null, document, [])
  assert.equal(reads, 2, 'Each query must read the prefix again')
  const callbackRun = nw.compile(selector, true, true)!
  reads = 0
  assert.deepEqual(
    callbackRun(nodes, () => false, document, []),
    nodes,
  )
  assert.equal(reads, 2, 'Callbacks must retain live prefix evaluation')
  for (const normalized of [
    '.box/**/ .block.inner > .content',
    '.box\t.block.inner\n>\t.content',
    '.\\62 ox .block.inner > .content',
  ]) {
    reads = 0
    assert.deepEqual(
      nw.compile(normalized, true)!(nodes, null, document, []),
      nodes,
    )
    assert.equal(reads, 1, normalized)
  }
})

test('callback mutations invalidate later candidates and ordinary calls see subsequent changes', t => {
  const { document, nw } = fixture(t)
  const box = document.querySelector('.box')!
  const nodes = Array.from(document.querySelectorAll('.content')).slice(0, 2)
  const run = nw.compile(selector, true, true)!
  assert.deepEqual(
    run(
      nodes,
      () => {
        box.className = ''
        return false
      },
      document,
      [],
    ),
    [nodes[0]],
  )
  assert.deepEqual(nw.select(selector, document), [])
  box.className = 'box'
  assert.deepEqual(nw.select(selector, document), nodes)
})

test('public queries preserve positional state across candidates and clear it after sibling moves', t => {
  const { document, nw } = fixture(t)
  document.body.innerHTML =
    '<section>' +
    Array.from(
      { length: 8 },
      (_, i) =>
        '<div class="box" id="box' +
        i +
        '"><article><p class="content"></p><p class="content"></p></article></div>',
    ).join('') +
    '</section>'
  const selectors = [
    '.box:first-child ~ .box:nth-of-type(2n) + .box .content',
    '.box:nth-child(2n) .content',
    '.box:nth-last-child(2n) .content',
    '.box:nth-last-of-type(2n) .content',
    '.box:only-child .content',
    '.box > article .content',
    '#box1 article > .content',
    'section > * article > .content',
    'section .box article .content',
    '.box:is(.box) .content',
    '.box article:is(article) > .content',
    '.box article[data-x] > .content',
    '.box article:nth-child(2n of article) > .content',
    '.box:nth-child(2n of .box) .content',
    '.box[data-x] .content',
    ':root .content',
    ':scope .content',
  ]
  for (const legacy of [false, true]) {
    nw.configure({ LEGACY: legacy })
    for (const value of selectors) {
      assert.deepEqual(
        nw.select(value, document),
        Array.from(document.querySelectorAll(value)),
        value,
      )
      const section = document.querySelector('section')!
      section.append(section.firstElementChild!)
      assert.deepEqual(
        nw.select(value, document),
        Array.from(document.querySelectorAll(value)),
        value + ' after move',
      )
    }
  }
})

test('ancestor eligibility does not add validation errors for malformed positional selectors', t => {
  const { nw } = fixture(t)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  t.onTestFinished(() => log.mockRestore())
  nw.configure({ LEGACY: true, VERBOSITY: false, LOGERRORS: true })
  nw.compile('.box:nth-child(bogus) .content', true)
  const ordinaryErrors = log.mock.calls.length
  assert(ordinaryErrors > 0)
  log.mockClear()
  nw.configure({ LEGACY: false })
  nw.compile('.box:nth-child(bogus) .content', true)
  assert.equal(log.mock.calls.length, ordinaryErrors)
})
