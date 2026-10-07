import assert from 'node:assert/strict'
import { compileFunction } from 'node:vm'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({ failure: '', closed: vi.fn() }))
vi.mock('../../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/fixture/chrome' }),
}))
vi.mock(
  '../../../../../../scripts/repo/bench/planner/adaptive/variants.mts',
  () => ({
    adaptiveBundle: (mode: string, prefix: number) => {
      const observations =
        state.failure === 'none'
          ? '[]'
          : state.failure === 'many'
            ? '[[1],[2]]'
            : state.failure === 'mismatch' && mode === 'prefix-switch'
              ? '[[2]]'
              : `[[32,${prefix},2,1,4]]`
      const selected =
        state.failure === 'length'
          ? '[]'
          : state.failure === 'identity'
            ? 'Array.from(doc.querySelectorAll(selector),node=>node.cloneNode())'
            : 'Array.from(doc.querySelectorAll(selector))'
      return `let features=[];function factory(){return{select:(selector,doc)=>{features=${observations};return ${selected}}}}factory.resetObservations=()=>{features=[]};factory.observations=()=>features;module.exports=factory;`
    },
  }),
)
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => {
      const dom = new JSDOM('<body></body>')
      vi.stubGlobal('document', dom.window.document)
      vi.stubGlobal('observationFactories', [])
      return {
        close: async () => {
          state.closed()
          dom.window.close()
        },
        newPage: async () => ({
          addScriptTag: async ({ content }: { content: string }) => {
            compileFunction(content, ['globalThis'])(globalThis)
          },
          evaluate: async (fn: (value: unknown) => unknown, value: unknown) =>
            fn(value),
        }),
      }
    },
  },
}))
import {
  nativeObservations,
  nodeObservations,
} from '../../../../../../scripts/repo/bench/planner/adaptive/evidence.mts'
const entries = [
  {
    id: 'fixture',
    family: 'fixture',
    split: 'train' as const,
    html: '<main><i></i><i></i></main>',
    selector: 'i',
    tags: [],
  },
]

test('adaptive observation collectors agree across prefix routes and reject inconsistent evidence', async () => {
  try {
    assert.deepEqual(nodeObservations(entries, 4), [
      { id: 'fixture', features: [32, 4, 2, 1, 4] },
    ])
    assert.deepEqual(
      await nativeObservations(entries, 4),
      nodeObservations(entries, 4),
    )
    state.failure = 'none'
    assert.deepEqual(nodeObservations(entries, 4), [
      { id: 'fixture', features: null },
    ])
    assert.deepEqual(await nativeObservations(entries, 4), [
      { id: 'fixture', features: null },
    ])
    const failures = ['length', 'mismatch', 'many']
    for (let index = 0, length = failures.length; index < length; index += 1) {
      state.failure = failures[index]!
      assert.throws(() => nodeObservations(entries, 4), {
        code: 'ERR_ASSERTION',
      })
      await assert.rejects(nativeObservations(entries, 4))
      assert.equal(document.querySelectorAll('iframe').length, 0)
    }
    state.failure = 'identity'
    await assert.rejects(nativeObservations(entries, 4))
    assert.equal(state.closed.mock.calls.length, 6)
  } finally {
    vi.unstubAllGlobals()
  }
})
