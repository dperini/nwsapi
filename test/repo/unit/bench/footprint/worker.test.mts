import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import type * as Shared from '../../../../../scripts/repo/bench/footprint/shared.mts'
const state = vi.hoisted(() => ({ failure: '', heap: 0 }))
function select(selector: string, document: Document) {
  const nodes = Array.from(document.querySelectorAll(selector))
  return state.failure === 'length'
    ? []
    : state.failure === 'identity'
      ? nodes.map(node => node.cloneNode())
      : nodes
}
vi.mock('../../../../../dist/nwsapi.js', () => ({
  default: () => ({ select }),
}))
vi.mock(
  '../../../../../scripts/repo/bench/footprint/shared.mts',
  async importOriginal => {
    const actual = await importOriginal<typeof Shared>()
    return {
      ...actual,
      require: () => ({
        DOMSelector: class {
          querySelectorAll = select
        },
      }),
    }
  },
)
vi.mock('node:timers/promises', () => ({ setImmediate: async () => {} }))

test('footprint worker keeps warmup separate and measures retained factories and cached selectors', async () => {
  const original = process.argv
  const gc = vi.fn()
  vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({
    rss: 0,
    heapTotal: 0,
    heapUsed: ++state.heap,
    external: 0,
    arrayBuffers: 0,
  }))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const load = async (args: string[]) => {
    vi.resetModules()
    process.argv = [original[0]!, 'worker.mts', ...args]
    await import('../../../../../scripts/repo/bench/footprint/worker.mts')
  }
  try {
    vi.stubGlobal('gc', undefined)
    await assert.rejects(load(['nwsapi', '1', '2']))
    vi.stubGlobal('gc', gc)
    await assert.rejects(load([]))
    await assert.rejects(load(['unknown']))
    const engines = ['nwsapi', 'dom-selector']
    for (let index = 0, length = engines.length; index < length; index += 1) {
      await load([engines[index]!, '1', '2'])
      const result = JSON.parse(log.mock.calls.at(-1)![0] as string)
      assert.deepEqual(
        [result.initialized, result.queried, result.cacheGrowth],
        [1, 2, 1],
      )
      assert.equal(result.fixtureSha256.length, 64)
    }
    await load(['nwsapi', '1'])
    await load(['nwsapi'])
    const defaults = JSON.parse(log.mock.calls.at(-1)![0] as string)
    assert.equal(defaults.initialized, 1 / 40)
    await assert.rejects(load(['nwsapi', '0', '1']), RangeError)
    await assert.rejects(load(['nwsapi', '1', '0']), RangeError)
    state.failure = 'length'
    await assert.rejects(load(['nwsapi', '1', '2']))
    state.failure = 'identity'
    await assert.rejects(load(['nwsapi', '1', '2']))
    assert.ok(gc.mock.calls.length > 0)
  } finally {
    process.argv = original
    vi.unstubAllGlobals()
    vi.resetModules()
  }
})
