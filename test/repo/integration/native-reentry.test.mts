import { test, expect } from 'vitest'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const factory = require('../../../src/nwsapi.js')

test('host matcher delegation stays bounded', t => {
  const { window } = new JSDOM('<div></div>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const node = window.document.body.firstElementChild
  for (const selector of [
    ':open',
    ':closed',
    ':modal',
    ':fullscreen',
    ':picture-in-picture',
  ]) {
    let calls = 0
    node.matches = function (
      value,
    ): this is HTMLElement & SVGElement & MathMLElement {
      if (++calls > 4) {
        throw new Error('recursive host matcher')
      }
      return engine.match(value, node)
    }
    expect(engine.match(selector, node), selector).toBe(false)
    expect(calls).toBeLessThanOrEqual(2)
    expect(calls).toBeGreaterThan(0)
  }
})

test('native matching recovers after exceptions and keeps host state', t => {
  const { window } = new JSDOM('<div></div>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const node = window.document.body.firstElementChild
  node.matches = function (): this is HTMLElement & SVGElement & MathMLElement {
    throw new Error('unsupported')
  }
  expect(engine.match(':open', node)).toBe(false)
  node.matches = function (): this is HTMLElement & SVGElement & MathMLElement {
    return true
  }
  expect(engine.match(':open', node)).toBe(true)
})
