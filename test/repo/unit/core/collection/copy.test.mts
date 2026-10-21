import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../../../dist/nwsapi.js'
import { collectionCopy } from '../../../../../src/core/collection/copy.mts'
import type { EngineState } from '../../../../../src/core/state/types.mts'

test('tag copies protect cached membership and preserve structural changes', t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' + '<i class="item"></i>'.repeat(24) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const engine = {
    Factory: factory,
    Config: { LEGACY: false },
    primordials: { WeakRefCtor: WeakRef },
    createWeakMap: () => new WeakMap(),
  } as unknown as EngineState
  const root = window.document.querySelector('main')!
  const nodes = root.getElementsByTagName('*')
  const first = collectionCopy(engine, nodes, root, undefined, root, true)
  first.reverse()
  first.pop()
  root.firstElementChild!.className = 'changed'
  const second = collectionCopy(engine, nodes, root, undefined, root, true)
  expect(second).not.toBe(first)
  expect(second).toEqual(Array.from(nodes))
  root.firstElementChild!.remove()
  expect(collectionCopy(engine, nodes, root, undefined, root, true)).toEqual(
    Array.from(nodes),
  )
  root.replaceChildren()
  expect(collectionCopy(engine, nodes, root, undefined, root, true)).toEqual([])
})

test('uncached small collections read length once and explicit snapshots avoid live reads', () => {
  const node = {} as Element
  let reads = 0
  const nodes = {
    0: node,
    get length() {
      ++reads
      return 1
    },
  }
  const engine = { Config: { LEGACY: false } } as EngineState
  const context = {} as Document
  expect(collectionCopy(engine, nodes, context)).toEqual([node])
  expect(reads).toBe(1)
  const snapshot = [node]
  const result = collectionCopy(engine, nodes, context, snapshot)
  expect(result).toEqual(snapshot)
  expect(result).not.toBe(snapshot)
  expect(reads).toBe(1)
  engine.Config.LEGACY = true
  expect(collectionCopy(engine, nodes, context)).toEqual([node])
  expect(reads).toBe(2)
})
