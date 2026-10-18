import assert from 'node:assert/strict'
import { JSDOM, type DOMWindow } from 'jsdom'
import { test } from 'vitest'
import { initializeApi } from '../../../../../src/core/initialize/api.mts'
import { initializeMatching } from '../../../../../src/core/initialize/matching.mts'
import { initializeRuntime } from '../../../../../src/core/initialize/runtime.mts'
import {
  prepareBulkHas,
  selectBulkHas,
} from '../../../../../src/core/select/has/match.mts'
import { createState } from '../../../../../src/core/state/create.mts'
import type {
  EngineGlobal,
  EngineState,
} from '../../../../../src/core/state/types.mts'
import factory from '../../../../../dist/nwsapi.js'

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

test('bulk direct-child has marks only parents of matching witnesses', t => {
  const cards = Array.from(
    { length: 64 },
    (_, index) =>
      `<section class="card" id="card-${index}">` +
      `<input${index % 3 === 0 ? ' checked' : ''}>` +
      '<input><input><input></section>',
  ).join('')
  const { window } = new JSDOM(
    `<!doctype html><body>${cards}` +
      '<section class="card" id="nested-only"><span><input checked></span></section>' +
      '</body>',
  )
  t.onTestFinished(() => window.close())
  const engine = createEngine(window)
  const selector = '.card:has(> input:checked)'
  const plan = prepareBulkHas(engine, selector, window.document)
  assert.equal(plan?.directChild, true)
  const anchors = engine.hasCandidates(
    plan!.anchor.nodeset[0]!,
    window.document,
  )
  const selected = selectBulkHas(engine, plan!, window.document, anchors)
  assert.deepEqual(
    selected,
    Array.from(window.document.querySelectorAll(selector)),
  )
  assert.equal(
    selected!.some(element => element.id === 'nested-only'),
    false,
  )

  const input = window.document.querySelector('input')!
  input.checked = !input.checked
  const fresh = selectBulkHas(
    engine,
    plan!,
    window.document,
    engine.hasCandidates(plan!.anchor.nodeset[0]!, window.document),
  )
  assert.deepEqual(
    fresh,
    Array.from(window.document.querySelectorAll(selector)),
  )
})

test('bulk has keeps unsupported direct child compounds on the regular path', t => {
  const { window } = new JSDOM(
    '<!doctype html><body><section class="card"></section></body>',
  )
  t.onTestFinished(() => window.close())
  const engine = createEngine(window)
  assert.equal(
    prepareBulkHas(engine, '.card:has(> input:unknown-state)', window.document),
    undefined,
  )
})
