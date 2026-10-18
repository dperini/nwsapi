import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  addPositions,
  buildSnapshot,
  createNthOfType,
  findPosition,
  scanTypePosition,
  stablePosition,
} from '../../../../../src/core/compile/position/nth-of-type.mts'
import type { TypePositions } from '../../../../../src/core/compile/position/nth-of-type.mts'
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
  let rankMapAllocations = 0
  const engine = createPositionEngine(
    () => {
      ++rankMapAllocations
      return new WeakMap()
    },
    () => ++snapshotReads,
  )
  const nthOfType = createNthOfType(engine)
  const nodes = Array.from(window.document.querySelectorAll('i'))

  for (let i = 0; i < nodes.length; ++i) {
    expect(nthOfType(nodes[i]!, 0, true)).toBe(i + 1)
    expect(nthOfType(nodes[i]!, 0, true)).toBe(i + 1)
  }

  expect(snapshotReads).toBe(1)
  expect(rankMapAllocations).toBe(0)
})

test('random and reversed large-bucket lookups build one rank map', t => {
  const { window } = new JSDOM('<main>' + '<i></i>'.repeat(24) + '</main>')
  t.onTestFinished(() => window.close())
  let allocations = 0
  const engine = createPositionEngine(() => {
    ++allocations
    return new WeakMap()
  })
  const nthOfType = createNthOfType(engine)
  const nodes = Array.from(window.document.querySelectorAll('i'))

  expect(nthOfType(nodes[17]!, 0, true)).toBe(18)
  expect(allocations).toBe(1)
  expect(nthOfType(nodes[5]!, 0, true)).toBe(6)
  expect(allocations).toBe(1)
  nthOfType(null, 2)
  for (let i = nodes.length - 1; i >= 0; --i) {
    expect(nthOfType(nodes[i]!, 0, true)).toBe(i + 1)
  }
  expect(allocations).toBe(2)
})

test('sparse accesses retain exact forward and reverse ranks', t => {
  const { window } = new JSDOM('<main>' + '<i></i>'.repeat(30) + '</main>')
  t.onTestFinished(() => window.close())
  const nthOfType = createNthOfType(createPositionEngine())
  const nodes = Array.from(window.document.querySelectorAll('i'))

  expect(nthOfType(nodes[23]!, 0, true)).toBe(24)
  expect(nthOfType(nodes[23]!, 1, true)).toBe(7)
  expect(nthOfType(nodes[8]!, 0, true)).toBe(9)
  expect(nthOfType(nodes[8]!, 1, true)).toBe(22)
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

test('large buckets remain distinct across namespace and parent revisits', t => {
  const { window } = new JSDOM('<main></main><aside></aside>')
  t.onTestFinished(() => window.close())
  const main = window.document.querySelector('main')!
  const aside = window.document.querySelector('aside')!
  main.innerHTML = '<item></item>'.repeat(12)
  aside.innerHTML = '<item></item>'.repeat(12)
  const htmlItems = Array.from(main.querySelectorAll('item'))
  const foreign = window.document.createElementNS('urn:foreign', 'item')
  main.insertBefore(foreign, htmlItems[6]!)
  const nthOfType = createNthOfType(createPositionEngine())

  expect(nthOfType(htmlItems[9]!, 0, true)).toBe(10)
  expect(nthOfType(foreign, 0, true)).toBe(1)
  expect(
    nthOfType(Array.from(aside.querySelectorAll('item'))[9]!, 0, true),
  ).toBe(10)
  expect(nthOfType(htmlItems[9]!, 0, true)).toBe(10)
})

test('large buckets use linear lookup when WeakMap is unavailable', t => {
  const { window } = new JSDOM('<main>' + '<i></i>'.repeat(12) + '</main>')
  t.onTestFinished(() => window.close())
  let allocations = 0
  const engine = createPositionEngine(() => {
    ++allocations
    return new WeakMap()
  })
  engine.primordials.WeakMapCtor = undefined
  const nthOfType = createNthOfType(engine)
  const nodes = Array.from(window.document.querySelectorAll('i'))

  expect(nthOfType(nodes[9]!, 0, true)).toBe(10)
  expect(nthOfType(nodes[3]!, 1, true)).toBe(9)
  expect(allocations).toBe(0)
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

test('wide type snapshots defer rank indexing until an out-of-order lookup', t => {
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
  expect(type.positions).toBeUndefined()
})

test('addPositions indexes only wide type buckets', () => {
  const engine = createPositionEngine()
  const wideNodes = Array.from({ length: 12 }, () => ({}) as Element)
  const narrowNodes = wideNodes.slice(0, 8)
  const wide: TypePositions = { nodes: wideNodes }
  const narrow: TypePositions = { nodes: narrowNodes }

  expect(addPositions(engine, narrow)).toBeUndefined()
  expect(narrow.positions).toBeUndefined()

  const positions = addPositions(engine, wide)
  expect(positions?.get(wideNodes[0]!)).toBe(1)
  expect(positions?.get(wideNodes[11]!)).toBe(12)
  expect(wide.positions).toBe(positions)
})

function createPositionEngine(
  createRankMap: () => WeakMap<Element, number> = () => new WeakMap(),
  onSnapshotRead: () => void = () => {},
): EngineState {
  class RankMap extends WeakMap<Element, number> {
    constructor() {
      super()
      return createRankMap()
    }
  }
  return {
    Config: { LEGACY: false },
    NAMESPACE: 'http://www.w3.org/1999/xhtml',
    primordials: { ObjectCreate: Object.create, WeakMapCtor: RankMap },
    firstOf: (node: ParentNode) => node.firstElementChild,
    createWeakMap: () => {
      const values = new WeakMap()
      return {
        get(key: object) {
          onSnapshotRead()
          return values.get(key)
        },
        set(key: object, value: object) {
          values.set(key, value)
          return this
        },
      }
    },
    tagOf: (element: Element) => element.localName,
  } as unknown as EngineState
}
