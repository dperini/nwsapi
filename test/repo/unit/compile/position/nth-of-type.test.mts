import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  buildSnapshot,
  createNthOfType,
  findPosition,
  scanTypePosition,
  stablePosition,
} from '../../../../../src/core/compile/position/nth-of-type.mts'
import type { EngineState } from '../../../../../src/core/state/types.mts'

test('stable positions reuse adjacent candidates in either direction', () => {
  const nodes = [{}, {}, {}] as Element[]
  expect(stablePosition(nodes, 0, 3, nodes[0]!, 0, true)).toBe(1)
  expect(stablePosition(nodes, 1, 3, nodes[1]!, 1, true)).toBe(2)
  expect(stablePosition(nodes, 1, 3, nodes[0]!, 1, true)).toBe(3)
  expect(stablePosition(nodes, 1, 3, nodes[2]!, 0, true)).toBeUndefined()
  expect(stablePosition(nodes, 1, 3, nodes[1]!, 0, false)).toBeUndefined()
})

test('stable ordered candidates advance the type-position cursor', t => {
  const { window } = new JSDOM('<main>' + '<i></i>'.repeat(24) + '</main>')
  t.onTestFinished(() => window.close())
  let snapshotReads = 0
  const engine = {
    Config: { LEGACY: false },
    NAMESPACE: 'http://www.w3.org/1999/xhtml',
    primordials: { ObjectCreate: Object.create, WeakMapCtor: WeakMap },
    firstOf: (node: ParentNode) => node.firstElementChild,
    createWeakMap: () => {
      const values = new WeakMap()
      return {
        get(key: object) {
          ++snapshotReads
          return values.get(key)
        },
        set(key: object, value: object) {
          values.set(key, value)
          return this
        },
      }
    },
  } as unknown as EngineState
  const nthOfType = createNthOfType(engine)
  const nodes = Array.from(window.document.querySelectorAll('i'))

  for (let i = 0; i < nodes.length; ++i) {
    expect(nthOfType(nodes[i]!, 0, true)).toBe(i + 1)
    expect(nthOfType(nodes[i]!, 0, true)).toBe(i + 1)
  }

  expect(snapshotReads).toBe(1)
})

test('type position scans count matching siblings in either direction', t => {
  const { window } = new JSDOM(
    '<main><i></i><b></b><i id="target"></i><i></i></main>',
  )
  t.onTestFinished(() => window.close())
  const target = window.document.querySelector('#target')!
  expect(scanTypePosition(target, 'i', target.namespaceURI, 0)).toBe(2)
  expect(scanTypePosition(target, 'i', target.namespaceURI, 1)).toBe(2)
  expect(findPosition([target.previousElementSibling!, target], target)).toBe(2)
  expect(findPosition([], target)).toBe(1)
})

test('live type positions reflect callback mutations in either direction', t => {
  const { window } = new JSDOM(
    '<main><i id="first"></i><b></b><i id="target"></i><i id="last"></i></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = createPositionEngine()
  const nthOfType = createNthOfType(engine)
  const parent = window.document.querySelector('main')!
  const first = parent.querySelector('#first')!
  const target = parent.querySelector('#target')!
  const last = parent.querySelector('#last')!

  expect(nthOfType(target, 0, false)).toBe(2)
  expect(nthOfType(target, 1, false)).toBe(2)

  const inserted = window.document.createElement('i')
  parent.insertBefore(inserted, target)
  expect(nthOfType(target, 0, false)).toBe(3)
  expect(nthOfType(target, 1, false)).toBe(2)

  first.remove()
  last.remove()
  expect(nthOfType(target, 0, false)).toBe(2)
  expect(nthOfType(target, 1, false)).toBe(1)
})

test('live type positions count only matching namespaces', t => {
  const { window } = new JSDOM(
    '<main><item id="target"></item><item id="last"></item></main>',
  )
  t.onTestFinished(() => window.close())
  const target = window.document.querySelector('#target')!
  const foreign = window.document.createElementNS('urn:foreign', 'item')
  target.parentNode!.insertBefore(foreign, target)
  const nthOfType = createNthOfType(createPositionEngine())

  expect(nthOfType(target, 0, false)).toBe(1)
  expect(nthOfType(target, 1, false)).toBe(2)
})

test('live type positions handle detached elements', t => {
  const { window } = new JSDOM('<main><i></i></main>')
  t.onTestFinished(() => window.close())
  const target = window.document.createElement('i')
  const nthOfType = createNthOfType(createPositionEngine())

  expect(nthOfType(target, 0, false)).toBe(1)
  expect(nthOfType(target, 1, false)).toBe(1)
})

test('live type position scans read siblings only in the requested direction', t => {
  const { window } = new JSDOM(
    '<main><i></i><b></b><i id="target"></i><i></i></main>',
  )
  t.onTestFinished(() => window.close())
  const target = window.document.querySelector('#target')!
  const elementPrototype = window.Element.prototype
  const previous = Object.getOwnPropertyDescriptor(
    elementPrototype,
    'previousElementSibling',
  )!
  const next = Object.getOwnPropertyDescriptor(
    elementPrototype,
    'nextElementSibling',
  )!
  let previousReads = 0
  let nextReads = 0
  Object.defineProperty(elementPrototype, 'previousElementSibling', {
    configurable: true,
    get() {
      ++previousReads
      return previous.get!.call(this)
    },
  })
  Object.defineProperty(elementPrototype, 'nextElementSibling', {
    configurable: true,
    get() {
      ++nextReads
      return next.get!.call(this)
    },
  })

  try {
    expect(scanTypePosition(target, 'i', target.namespaceURI, 0)).toBe(2)
    expect(previousReads).toBe(3)
    expect(nextReads).toBe(0)

    previousReads = 0
    expect(scanTypePosition(target, 'i', target.namespaceURI, 1)).toBe(2)
    expect(previousReads).toBe(0)
    expect(nextReads).toBe(2)
  } finally {
    Object.defineProperty(elementPrototype, 'previousElementSibling', previous)
    Object.defineProperty(elementPrototype, 'nextElementSibling', next)
  }
})

test('wide type snapshots index siblings after collecting them', t => {
  const { window } = new JSDOM('<main>' + '<i></i>'.repeat(12) + '</main>')
  t.onTestFinished(() => window.close())
  const parent = window.document.querySelector('main')!
  const snapshot = { parent, types: Object.create(null) }
  const engine = {
    NAMESPACE: 'http://www.w3.org/1999/xhtml',
    firstOf: (node: ParentNode) => node.firstElementChild,
    primordials: { ObjectCreate: Object.create, WeakMapCtor: WeakMap },
  } as unknown as EngineState
  buildSnapshot(snapshot, engine, parent.firstElementChild!)
  const type = snapshot.types.i!
  expect(type.nodes).toHaveLength(12)
  expect(type.positions?.get(type.nodes[11]!)).toBe(12)
})

function createPositionEngine() {
  return {
    Config: { LEGACY: false },
    NAMESPACE: 'http://www.w3.org/1999/xhtml',
    primordials: { ObjectCreate: Object.create, WeakMapCtor: WeakMap },
    firstOf: (node: ParentNode) => node.firstElementChild,
    createWeakMap: () => new WeakMap(),
    tagOf: (element: Element) => element.localName,
  } as unknown as EngineState
}
