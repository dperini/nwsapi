import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  post: vi.fn(async (command: string) =>
    command === 'HeapProfiler.stopSampling'
      ? {
          profile: {
            head: {
              selfSize: 10,
              callFrame: {
                functionName: 'root',
                url: 'engine.js',
                lineNumber: 0,
              },
              children: [
                {
                  selfSize: 20,
                  callFrame: {
                    functionName: 'compile',
                    url: 'engine.js',
                    lineNumber: 1,
                  },
                  children: [],
                },
                {
                  selfSize: 40,
                  callFrame: {
                    functionName: 'compile',
                    url: 'engine.js',
                    lineNumber: 1,
                  },
                  children: [],
                },
                {
                  selfSize: 30,
                  callFrame: {
                    functionName: '',
                    url: 'engine.js',
                    lineNumber: 2,
                  },
                  children: [],
                },
              ],
            },
          },
        }
      : {},
  ),
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    disconnect = state.disconnect
    post = state.post
  },
}))
vi.mock('node:timers/promises', () => ({ setImmediate: async () => {} }))
import { profileAncestorMemory } from '../../../../../scripts/repo/bench/ancestor/memory.mts'

test('ancestor profiler rotates candidates and aggregates duplicate allocation sites outside query work', async () => {
  let heap = 0
  vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({
    rss: 0,
    heapTotal: 0,
    heapUsed: ++heap,
    external: 0,
    arrayBuffers: 0,
  }))
  const counts = [0, 0, 0]
  const rows = await profileAncestorMemory(index => {
    counts[index]! += 1
  })
  assert.equal(rows.length, 9)
  assert.deepEqual(counts, [18_000, 18_000, 18_000])
  assert.deepEqual(
    rows.slice(0, 3).map(row => row.name),
    ['baseline', 'always-cache', 'depth-gated'],
  )
  assert.deepEqual(
    rows.slice(3, 6).map(row => row.name),
    ['always-cache', 'depth-gated', 'baseline'],
  )
  assert.equal(rows[0]!.allocatedBytesEstimate, 100)
  assert.deepEqual(rows[0]!.allocationSites, [
    { site: 'compile engine.js:2', bytes: 60 },
    { site: '(anonymous) engine.js:3', bytes: 30 },
    { site: 'root engine.js:1', bytes: 10 },
  ])
  assert.deepEqual(
    [rows[0]!.heapBefore, rows[0]!.heapAfter, rows[0]!.heapAfterRepeat],
    [1, 2, 3],
  )
  assert.equal(
    state.post.mock.calls.filter(
      call => call[0] === 'HeapProfiler.collectGarbage',
    ).length,
    108,
  )
  const custom = await profileAncestorMemory(() => {}, ['custom'])
  assert.equal(custom.length, 3)
  assert.deepEqual(await profileAncestorMemory(() => {}, []), [])
  await assert.rejects(
    profileAncestorMemory(() => {
      throw Object.assign(new Error('query'), { code: 'QUERY_FAILED' })
    }),
    { code: 'QUERY_FAILED' },
  )
  assert.equal(state.disconnect.mock.calls.length, 4)
})
