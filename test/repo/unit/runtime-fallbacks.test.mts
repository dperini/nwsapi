import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import type { EngineState } from '../../../src/core/state/engine.d.ts'
import type factory from '../../../dist/nwsapi.js'

const require = createRequire(import.meta.url)
const create = require('../../../dist/nwsapi.js') as typeof factory

test('a missing operator rejects compilation and recovers after restoration', t => {
  const { window } = new JSDOM('<p data-value="yes"></p>')
  t.onTestFinished(() => window.close())
  const engine = create(window)
  const operators = Reflect.get(engine, 'Operators') as EngineState['Operators']
  const saved = operators['=']!
  delete operators['=']
  try {
    expect(() => engine.compile('[data-value="yes"]', true)).toThrow(
      window.DOMException,
    )
    engine.configure({ VERBOSITY: false, LOGERRORS: false })
    const resolver = engine.compile('[data-value="yes"]', true)!
    expect(
      resolver(
        [window.document.querySelector('p')!],
        null,
        window.document,
        [],
      ),
    ).toEqual([])
  } finally {
    operators['='] = saved
  }
  engine.configure({ VERBOSITY: true }, true)
  expect(engine.select('[data-value="yes"]', window.document)).toEqual([
    window.document.querySelector('p'),
  ])
})

test('astral identifier escapes work without String.fromCodePoint', t => {
  const { window } = new JSDOM('<p></p>')
  t.onTestFinished(() => window.close())
  const module = { exports: {} }
  const context = vm.createContext({ module, exports: {} })
  // Disable the API only in the isolated engine realm before it captures built-ins.
  vm.runInContext('String.fromCodePoint = undefined', context)
  const source = readFileSync(
    require.resolve('../../../dist/nwsapi.js'),
    'utf8',
  )
  vm.runInContext(source, context, {
    filename: require.resolve('../../../dist/nwsapi.js'),
  })
  const engine = (module.exports as typeof factory)(window)
  const node = window.document.querySelector('p')!
  node.id = '\uD83D\uDE00'
  expect(engine.first('#\\1f600', window.document)).toBe(node)
  expect(engine.match('#\\01f600', node)).toBe(true)
  node.id = '\uDBFF\uDFFF'
  expect(engine.first('#\\10ffff', window.document)).toBe(node)
  expect(engine.match('#\\1f600', node)).toBe(false)
})
