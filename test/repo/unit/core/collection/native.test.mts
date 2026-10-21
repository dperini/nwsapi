import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { hasNativeCollectionLength } from '../../../../../src/core/collection/native.mts'

test('native collection detection distinguishes native accessors from JavaScript getters', t => {
  const { window } = new JSDOM('<!doctype html>')
  t.onTestFinished(() => window.close())
  expect(hasNativeCollectionLength(window.document)).toBe(false)
  const prototype = {}
  const document = {
    defaultView: { HTMLCollection: { prototype } },
  } as unknown as Document
  Object.defineProperty(prototype, 'length', {
    configurable: true,
    get: Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get!.bind(
      new Map(),
    ),
  })
  expect(hasNativeCollectionLength(document)).toBe(true)
  Object.defineProperty(prototype, 'length', {
    configurable: true,
    get() {
      return '[native code]'
    },
  })
  expect(hasNativeCollectionLength(document)).toBe(false)
})

test('missing, detached, and inaccessible collection capabilities preserve the fallback', () => {
  for (const document of [
    { defaultView: null },
    { defaultView: {} },
    { defaultView: { HTMLCollection: { prototype: {} } } },
    {
      get defaultView() {
        throw new Error('Unavailable view')
      },
    },
  ]) {
    expect(hasNativeCollectionLength(document as Document)).toBe(false)
  }
})
