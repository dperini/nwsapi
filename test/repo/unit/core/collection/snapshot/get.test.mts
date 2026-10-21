import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../../../../dist/nwsapi.js'
import {
  collectionSnapshot,
  prepareCollectionState,
  reuseCollectionSnapshot,
} from '../../../../../../src/core/collection/snapshot/get.mts'
import type { EngineState } from '../../../../../../src/core/state/types.mts'

export function snapshotEngine() {
  return {
    Factory: factory,
    Config: { LEGACY: false },
    primordials: { WeakRefCtor: WeakRef },
    createWeakMap: () => new WeakMap(),
  } as unknown as EngineState
}

test('tag snapshots survive class changes while class snapshots follow membership', async t => {
  const { window } = new JSDOM(
    '<!doctype html><main>' + '<i class="item"></i>'.repeat(24) + '</main>',
  )
  t.onTestFinished(() => window.close())
  const engine = snapshotEngine()
  const root = window.document.querySelector('main')!
  const tags = root.getElementsByTagName('i')
  const classes = root.getElementsByClassName('item')
  const readTags = () =>
    collectionSnapshot(engine, tags, root, undefined, true, undefined, true)
  const readClasses = () =>
    collectionSnapshot(engine, classes, root, undefined, true)
  const initialTags = readTags()
  const initialClasses = readClasses()
  expect(initialTags).not.toBe(tags)
  expect(initialClasses).not.toBe(classes)
  root.firstElementChild!.className = 'other'
  expect(readTags()).toBe(initialTags)
  expect(readClasses()).not.toBe(initialClasses)
  expect(Array.from(readClasses())).toEqual(Array.from(classes))
  root.lastElementChild!.className = 'other'
  await Promise.resolve()
  expect(readTags()).toBe(initialTags)
  expect(Array.from(readClasses())).toEqual(Array.from(classes))
  root.prepend(window.document.createElement('i'))
  expect(readTags()).not.toBe(initialTags)
  expect(Array.from(readTags())).toEqual(Array.from(tags))
  const afterInsert = readTags()
  root.firstElementChild!.remove()
  await Promise.resolve()
  expect(readTags()).not.toBe(afterInsert)
  expect(Array.from(readTags())).toEqual(Array.from(tags))
})

test('snapshot state shares observers by membership and invalidates after adoption', t => {
  const first = new JSDOM('<!doctype html><main><i></i></main>')
  const second = new JSDOM('<!doctype html><body></body>')
  t.onTestFinished(() => {
    first.window.close()
    second.window.close()
  })
  const engine = snapshotEngine()
  engine.collectionRoots = new WeakMap()
  const context = first.window.document.querySelector('main')!
  const view = first.window as unknown as Window & typeof globalThis
  const tagState = prepareCollectionState(engine, context, context, view, true)
  const classState = prepareCollectionState(engine, context, context, view)
  expect(tagState).not.toBe(classState)
  expect(prepareCollectionState(engine, context, context, view, true)).toBe(
    tagState,
  )
  expect(prepareCollectionState(engine, context, context, view)).toBe(
    classState,
  )
  const key = {}
  const nodes = Array.from(context.children)
  tagState.copies.set(key, nodes)
  engine.collectionStates = new WeakMap([[key, tagState]])
  expect(reuseCollectionSnapshot(engine, context, key)).toBe(nodes)
  second.window.document.adoptNode(context)
  expect(reuseCollectionSnapshot(engine, context, key)).toBeUndefined()
  expect(prepareCollectionState(engine, context, context, view, true)).toBe(
    tagState,
  )
  expect(tagState.document.deref()).toBe(second.window.document)
  expect(tagState.copies.get(key)).toBeUndefined()
})

test('snapshot bypasses remain live when weak references or collection support are absent', t => {
  const { window } = new JSDOM('<!doctype html><main><i></i></main>')
  t.onTestFinished(() => window.close())
  const engine = snapshotEngine()
  const root = window.document.querySelector('main')!
  const tags = root.getElementsByTagName('i')
  engine.primordials.WeakRefCtor = undefined
  expect(
    collectionSnapshot(engine, tags, root, undefined, true, undefined, true),
  ).toBe(tags)
  engine.primordials.WeakRefCtor = WeakRef
  const array = Array.from(tags)
  expect(
    collectionSnapshot(engine, array, root, undefined, true, undefined, true),
  ).toBe(array)
  expect(engine.collectionRoots).toBeUndefined()
})
