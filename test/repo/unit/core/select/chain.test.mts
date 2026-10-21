import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import {
  appendNativeLevel,
  appendSnapshotLevel,
  appendTaggedLevel,
  fetchLevel,
} from '../../../../../src/core/select/chain.mts'
import { MIN_COLLECTION_SNAPSHOT_LENGTH } from '../../../../../src/core/collection/snapshot/skip.mts'
import type { EngineState } from '../../../../../src/core/state/types.mts'

test('native and snapshot loops append in order and read collection length once', () => {
  for (const append of [appendNativeLevel, appendSnapshotLevel]) {
    const first = {} as Element
    const second = {} as Element
    let lengthReads = 0
    const nodes = {
      0: first,
      1: second,
      get length() {
        ++lengthReads
        return 2
      },
    }
    const out = [second]
    expect(append(nodes, out)).toBe(out)
    expect(out).toEqual([second, first, second])
    expect(lengthReads).toBe(1)
  }
})

test('native small levels use live reads while large and JavaScript levels keep snapshots', t => {
  const { window } = new JSDOM('<!doctype html><main></main>')
  t.onTestFinished(() => window.close())
  const root = window.document.querySelector('main')!
  for (const nativeCollections of [false, true]) {
    for (const width of [
      0,
      1,
      MIN_COLLECTION_SNAPSHOT_LENGTH - 1,
      MIN_COLLECTION_SNAPSHOT_LENGTH,
    ]) {
      root.innerHTML = '<i class="item"></i>'.repeat(width)
      const snapshot = vi.fn((nodes: ArrayLike<Element>) => Array.from(nodes))
      const engine = {
        nativeCollections,
        collectionSnapshot: snapshot,
      } as unknown as EngineState
      for (const part of [
        { tag: 'i', cls: undefined },
        { tag: undefined, cls: 'item' },
      ]) {
        snapshot.mockClear()
        expect(fetchLevel(engine, part, root, [])).toEqual([...root.children])
        expect(snapshot).toHaveBeenCalledTimes(
          nativeCollections && width < MIN_COLLECTION_SNAPSHOT_LENGTH ? 0 : 1,
        )
      }
      root.append(window.document.createElement('i'))
      expect(
        fetchLevel(engine, { tag: 'i', cls: undefined }, root, []),
      ).toEqual([...root.children])
    }
  }
})

test('native chain lookup reuses its observed length without reading it again', () => {
  const node = {} as Element
  let reads = 0
  const nodes = {
    0: node,
    get length() {
      ++reads
      return 1
    },
  }
  const root = { getElementsByTagName: () => nodes } as unknown as Document
  const engine = { nativeCollections: true } as EngineState
  expect(fetchLevel(engine, { tag: 'i', cls: undefined }, root, [])).toEqual([
    node,
  ])
  expect(reads).toBe(1)
  expect(appendNativeLevel(nodes, [], 0)).toEqual([])
  expect(reads).toBe(1)
})

test('tag filtering folds only HTML names and preserves exact foreign names', t => {
  const { window } = new JSDOM(
    '<!doctype html><div class="item"></div><span class="item"></span>',
  )
  t.onTestFinished(() => window.close())
  const document = window.document
  const html = document.querySelector('div')!
  const upper = document.createElementNS('urn:foreign', 'DIV')
  const lower = document.createElementNS('urn:foreign', 'div')
  const nodes = [html, upper, lower, document.querySelector('span')!]
  const engine = {
    HTML_DOCUMENT: true,
    NAMESPACE: html.namespaceURI,
  } as EngineState
  expect(appendTaggedLevel(engine, nodes, 'DIV', [])).toEqual([html, upper])
  engine.HTML_DOCUMENT = false
  expect(appendTaggedLevel(engine, nodes, 'DIV', [])).toEqual([upper])
  expect(appendTaggedLevel(engine, nodes, 'div', [])).toEqual([html, lower])
})
