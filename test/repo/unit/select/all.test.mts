import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { JSDOM, type DOMWindow } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'
import { registerLegacy } from '../../common/legacy.mts'

const windows: DOMWindow[] = []

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.close()
  }
})

test('class descendant type unions preserve order and nested anchors', () => {
  const { window } = new JSDOM(
    '<!doctype html><div class="card" id="outer"><a id="before"></a>' +
      '<div class="card" id="inner"><span id="nested"></span></div>' +
      '<span id="after"></span></div>',
  )
  windows.push(window)
  const NW = registerLegacy(factory(window))
  for (let index = 0; index < 16; ++index) {
    window.document.body!.insertAdjacentHTML(
      'beforeend',
      `<div class="card"><a id="a${index}"></a><span id="s${index}"></span></div>`,
    )
  }
  assert.deepEqual(
    Array.from(NW.select('.card :is(a, span)', window.document)).map(
      element => element.id,
    ),
    [
      'before',
      'nested',
      'after',
      ...Array.from({ length: 16 }, (_, index) => [
        `a${index}`,
        `s${index}`,
      ]).flat(),
    ],
  )
})

test('class descendant type unions reject callbacks and sparse roots', () => {
  const { window } = new JSDOM('<!doctype html><div class="card"><a></a></div>')
  windows.push(window)
  const engine = factory(window)
  assert.deepEqual(
    Array.from(engine.select('.card :is(a, span)', window.document)),
    [window.document.querySelector('a')],
  )
  assert.equal(
    engine.select('.card :is(a, span)', window.document, () => {}).length,
    1,
  )
})
