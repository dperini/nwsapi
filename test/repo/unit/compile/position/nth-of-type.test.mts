import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  buildSnapshot,
  findPosition,
  scanPosition,
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

test('position scans count matching siblings in forward and reverse order', t => {
  const { window } = new JSDOM(
    '<main><i></i><b></b><i id="target"></i><i></i></main>',
  )
  t.onTestFinished(() => window.close())
  const target = window.document.querySelector('#target')!
  const parent = target.parentNode
  const engine = {
    firstOf: (node: ParentNode) => node.firstElementChild,
  } as unknown as EngineState
  expect(
    scanPosition(engine, parent, target, 'i', target.namespaceURI, 0),
  ).toBe(2)
  expect(
    scanPosition(engine, parent, target, 'i', target.namespaceURI, 1),
  ).toBe(2)
  expect(scanTypePosition(target, 'i', target.namespaceURI, 0)).toBe(2)
  expect(scanTypePosition(target, 'i', target.namespaceURI, 1)).toBe(2)
  expect(findPosition([target.previousElementSibling!, target], target)).toBe(2)
  expect(findPosition([], target)).toBe(1)
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
