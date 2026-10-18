import assert from 'node:assert/strict'
import { JSDOM, type DOMWindow } from 'jsdom'
import { test } from 'vitest'
import { initializeApi } from '../../../../src/core/initialize/api.mts'
import { initializeMatching } from '../../../../src/core/initialize/matching.mts'
import { initializeRuntime } from '../../../../src/core/initialize/runtime.mts'
import { createState } from '../../../../src/core/state/create.mts'
import type {
  EngineGlobal,
  EngineState,
} from '../../../../src/core/state/types.mts'
import factory from '../../../../dist/nwsapi.js'

function createEngine(window: DOMWindow) {
  const engine = createState(
    window as unknown as EngineGlobal,
    factory as unknown as EngineState['Factory'],
  )
  initializeRuntime(engine)
  initializeMatching(engine)
  initializeApi(engine)
  engine.initialize(engine.doc)
  return engine
}

test('class-anchored child unions match direct parent paths', t => {
  const cards = Array.from(
    { length: 12 },
    (_, index) =>
      `<section class="card"><ul class="list"><li class="row">` +
      `<a id="link-${index}"></a><span id="badge-${index}"></span>` +
      `</li><li><a id="wrong-${index}"></a></li></ul></section>`,
  ).join('')
  const { window } = new JSDOM(`<!doctype html><body>${cards}</body>`)
  t.onTestFinished(() => window.close())
  const engine = createEngine(window)
  const selector = '.card > .list > .row > :is(a, span)'
  const selected = engine.selectChildren(selector, window.document)
  assert.deepEqual(
    selected,
    Array.from(window.document.querySelectorAll(selector)),
  )
  assert.equal(selected!.length, 24)

  window.document
    .querySelector('.row')!
    .append(window.document.createElement('a'))
  assert.deepEqual(
    engine.selectChildren(selector, window.document),
    Array.from(window.document.querySelectorAll(selector)),
  )
})

test('wide deep child unions preserve native order and identity', t => {
  const cards = Array.from(
    { length: 144 },
    (_, index) =>
      `<section class="card"><ul class="list"><li class="row">` +
      `<a id="wide-link-${index}"></a><span id="wide-badge-${index}"></span>` +
      `</li><li><a id="wide-wrong-${index}"></a></li></ul></section>`,
  ).join('')
  const { window } = new JSDOM(`<!doctype html><body>${cards}</body>`)
  t.onTestFinished(() => window.close())
  const engine = createEngine(window)
  const selector = '.card > .list > .row > :is(a, span)'
  const actual = engine.select(selector, window.document)
  const expected = Array.from(window.document.querySelectorAll(selector))
  assert.equal(actual.length, 288)
  assert.deepEqual(actual, expected)
})

test('wide deep child unions reorder nested anchors before later siblings', t => {
  const nested =
    '<section class="card"><ul class="list"><li class="row">' +
    '<a id="nested-link"></a></li></ul></section>'
  const first =
    '<section class="card"><ul class="list"><li class="row">' +
    `<span id="first"><span>${nested}</span></span><a id="last"></a>` +
    '</li></ul></section>'
  const remainder = Array.from(
    { length: 127 },
    (_, index) =>
      `<section class="card"><ul class="list"><li class="row">` +
      `<a id="extra-${index}"></a></li></ul></section>`,
  ).join('')
  const { window } = new JSDOM(
    `<!doctype html><body>${first}${remainder}</body>`,
  )
  t.onTestFinished(() => window.close())
  const engine = createEngine(window)
  const selector = '.card > .list > .row > :is(a, span)'
  const actual = engine.select(selector, window.document)
  const expected = Array.from(window.document.querySelectorAll(selector))
  assert.equal(window.document.getElementsByClassName('card').length, 129)
  assert.deepEqual(actual, expected)
})

test('repeated class anchors deduplicate nested matches', t => {
  const { window } = new JSDOM(
    '<!doctype html><body>' +
      '<div class="card"><div class="card"><div class="card"><a id="match"></a></div></div></div>' +
      '</body>',
  )
  t.onTestFinished(() => window.close())
  const engine = createEngine(window)
  const selector = '.card > .card > .card > a'
  assert.deepEqual(
    engine.selectChildren(selector, window.document),
    Array.from(window.document.querySelectorAll(selector)),
  )
})
