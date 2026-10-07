import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import {
  BENCHMARK_CACHE_PATH,
  BENCHMARK_MEMORY_PATH,
  BENCHMARK_SELECTORS_PATH,
} from '../../../../scripts/repo/lib/paths.mts'
const state = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  runNode: state.run,
}))

test('benchmark launcher selects known entrypoints and forwards arguments with explicit garbage collection', async () => {
  const original = process.argv
  const load = async (args: string[]) => {
    vi.resetModules()
    process.argv = [original[0]!, 'bench/run.mts', ...args]
    await import('../../../../scripts/repo/bench/run.mts')
  }
  try {
    const entries = [
      ['cache', BENCHMARK_CACHE_PATH],
      ['memory', BENCHMARK_MEMORY_PATH],
      ['selectors', BENCHMARK_SELECTORS_PATH],
    ]
    for (let index = 0, length = entries.length; index < length; index += 1) {
      await load([entries[index]![0]!, '--fixture'])
      assert.deepEqual(state.run.mock.calls.at(-1), [
        '--expose-gc',
        [entries[index]![1], '--fixture'],
      ])
    }
    await assert.rejects(load([]))
    await assert.rejects(load(['unknown']))
    await assert.rejects(load(['__proto__']))
    const failure = Object.assign(new Error('child'), { code: 'CHILD_FAILED' })
    state.run.mockImplementationOnce(() => {
      throw failure
    })
    await assert.rejects(load(['cache']), { code: 'CHILD_FAILED' })
  } finally {
    process.argv = original
    vi.resetModules()
  }
})
