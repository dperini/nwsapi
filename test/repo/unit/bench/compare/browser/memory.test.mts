import assert from 'node:assert/strict'
import type { CDPSession, Page } from '@playwright/test'
import { test, vi } from 'vitest'
import { profileBrowserMemory } from '../../../../../../scripts/repo/bench/compare/browser/memory.mts'

test('browser memory sampling rotates queries, includes discarded objects and groups repeated allocation frames', async () => {
  const calls = [0, 0]
  vi.stubGlobal('window', {
    queries: [
      () => {
        calls[0]! += 1
      },
      () => {
        calls[1]! += 1
      },
    ],
  })
  const evaluate = async (fn: (arg?: number) => unknown, arg?: number) =>
    fn(arg)
  const page = { evaluate } as unknown as Page
  let heap = 0
  const send = vi.fn(async (command: string) => {
    if (command === 'Runtime.getHeapUsage') {
      return { usedSize: ++heap }
    }
    return {
      profile: {
        head: {
          selfSize: 10,
          callFrame: { functionName: '', url: 'engine.js', lineNumber: 0 },
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
              selfSize: 30,
              callFrame: {
                functionName: 'compile',
                url: 'engine.js',
                lineNumber: 1,
              },
              children: [],
            },
          ],
        },
      },
    }
  })
  const session = { send } as unknown as CDPSession
  try {
    const rows = await profileBrowserMemory(page, session)
    assert.equal(rows.length, 6)
    assert.deepEqual(calls, [18_000, 18_000])
    assert.deepEqual(
      rows.map(row => row.name),
      [
        'baseline',
        'candidate',
        'candidate',
        'baseline',
        'baseline',
        'candidate',
      ],
    )
    assert.equal(rows[0]!.allocatedBytesEstimate, 60)
    assert.deepEqual(rows[0]!.allocationSites, [
      { site: 'compile engine.js:2', bytes: 50 },
      { site: '(anonymous) engine.js:1', bytes: 10 },
    ])
    assert.deepEqual(
      [rows[0]!.heapBefore, rows[0]!.heapAfter, rows[0]!.heapAfterRepeat],
      [1, 2, 3],
    )
    assert.equal(
      send.mock.calls.filter(call => call[0] === 'HeapProfiler.collectGarbage')
        .length,
      72,
    )
    send.mockRejectedValueOnce(
      Object.assign(new Error('session'), { code: 'CDP_FAILED' }),
    )
    await assert.rejects(profileBrowserMemory(page, session), {
      code: 'CDP_FAILED',
    })
  } finally {
    vi.unstubAllGlobals()
  }
})
