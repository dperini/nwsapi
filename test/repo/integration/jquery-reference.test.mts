import type * as NwsapiModule from '../../../src/nwsapi.js'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { test, type TestContext } from 'vitest'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js') as typeof NwsapiModule.default
// Pin the current major release as the compatibility reference.
const { jQueryFactory: jquery } = require('jquery/factory-slim')

function fixture(t: TestContext) {
  const { window } = new JSDOM(
    '<p id="before"></p><main><p id="a" class="picked"></p><p id="b"></p><p id="c" class="picked"></p><p id="d"></p></main><p id="after"></p>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const file = require.resolve('../../../src/modules/nwsapi-jquery.js')
  runInNewContext(
    readFileSync(file, 'utf8'),
    { NW: { Dom: engine } },
    { filename: file },
  )
  const $ = jquery(window)
  assert.equal($.fn.jquery, '4.0.0+slim')
  const main = window.document.getElementsByTagName('main')[0]
  const ids = (nodes: ArrayLike<Element> | Iterable<Element>) =>
    Array.from(nodes, (node: Element) => node.id)
  return {
    main,
    actual: (selector: string) => ids(engine.select(selector, main)),
    reference: (selector: string) => ids($(main).find(selector)),
  }
}

test('optional positional selectors agree with real jQuery for supported ordered-set queries', t => {
  const { main, actual, reference } = fixture(t)
  const cases = [
    ['p:eq(1)', ['b']],
    ['p:even', ['a', 'c']],
    ['p:odd', ['b', 'd']],
    ['p:lt(2)', ['a', 'b']],
    ['p:gt(1)', ['c', 'd']],
    ['p.picked:eq(1)', ['c']],
    ['p:eq(99)', []],
  ] as const
  for (let run = 0; run < 2; run++) {
    for (const [selector, expected] of cases) {
      assert.deepEqual(reference(selector), expected, 'jQuery: ' + selector)
      assert.deepEqual(
        actual(selector),
        reference(selector),
        'NWSAPI: ' + selector,
      )
    }
  }
  main!.insertBefore(main!.lastElementChild!, main!.firstElementChild)
  for (const [selector] of cases) {
    assert.deepEqual(
      actual(selector),
      reference(selector),
      'after reorder: ' + selector,
    )
  }
})

test('documented positional differences stay explicit against real jQuery', t => {
  const { actual, reference } = fixture(t)
  // These assertions record known limits; they are not compatibility passes.
  const differences = [
    ['p:eq(-1)', ['d'], []],
    ['p:first', ['a'], []],
    ['p:last', ['d'], []],
    ['p:nth(1)', ['b'], ['a']],
    ['p:eq(1).picked', [], ['c']],
  ] as const
  for (const [selector, jqueryIds, extensionIds] of differences) {
    assert.deepEqual(reference(selector), jqueryIds, 'jQuery: ' + selector)
    assert.deepEqual(
      actual(selector),
      extensionIds,
      'extension limit: ' + selector,
    )
    assert.notDeepEqual(extensionIds, jqueryIds)
  }
})
