import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { JSDOM, type DOMWindow } from 'jsdom'
import factory from '../../../../../../../dist/nwsapi.js'

const windows: DOMWindow[] = []

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.close()
  }
})

test('read-only input checks read the type once', () => {
  const { window } = new JSDOM('<!doctype html><input type="checkbox">')
  windows.push(window)
  const input = window.document.querySelector('input')!
  let reads = 0
  Object.defineProperty(input, 'type', {
    configurable: true,
    get() {
      ++reads
      return 'checkbox'
    },
  })

  assert.equal(factory(window).match(':read-only', input), true)
  assert.equal(reads, 1)
})
