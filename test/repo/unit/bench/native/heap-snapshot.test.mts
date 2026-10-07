import assert from 'node:assert/strict'
import type * as fs from 'node:fs'
import type * as util from 'node:util'
import { JSDOM } from 'jsdom'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: { count: '2', queries: '3' } as Record<string, string>,
  write: vi.fn(),
  chunk: vi.fn(),
  closeFile: vi.fn(),
  open: vi.fn(() => 1),
  mkdir: vi.fn(),
  temporary: vi.fn(() => '/fixture/heap'),
  launch: vi.fn(),
  close: vi.fn(),
}))
vi.mock('node:util', async importOriginal => ({
  ...(await importOriginal<typeof util>()),
  parseArgs: () => ({ values: state.values }),
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof fs>()),
  writeFileSync: state.write,
  writeSync: state.chunk,
  closeSync: state.closeFile,
  openSync: state.open,
  mkdirSync: state.mkdir,
  mkdtempSync: state.temporary,
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: state.launch } }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function execute(
  failure: 'none' | 'metric' | 'query' | 'snapshot' = 'none',
) {
  vi.resetModules()
  const dom = new JSDOM('<body></body>')
  let metrics = 0
  const listeners = new Map<string, (value: { chunk: string }) => void>()
  const session = {
    on: vi.fn((name, listener) => {
      listeners.set(name, listener)
    }),
    off: vi.fn(name => {
      listeners.delete(name)
    }),
    send: vi.fn(async (method: string) => {
      if (method === 'Performance.getMetrics') {
        return {
          metrics:
            failure === 'metric'
              ? []
              : [
                  {
                    name: 'JSHeapUsedSize',
                    value: [1000, 1200, 1500, 1400, 1300, 1100][metrics++],
                  },
                ],
        }
      }
      if (method === 'HeapProfiler.stopSampling') {
        return { profile: { samples: [] } }
      }
      if (method === 'HeapProfiler.takeHeapSnapshot') {
        if (failure === 'snapshot') {
          throw new Error('snapshot failure')
        }
        listeners.get('HeapProfiler.addHeapSnapshotChunk')!({ chunk: '{}' })
      }
      return {}
    }),
  }
  const page = {
    addScriptTag: vi.fn(),
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async <Input, Output>(
      callback: (value: Input) => Output,
      value: Input,
    ) => callback(value),
  }
  const host = dom.window as unknown as {
    __make: (window: unknown) => {
      select: (selector: string, document: Document) => ArrayLike<Element>
      first: (selector: string, document: Document) => Element | null
    }
  }
  host.__make = () => ({
    select: (selector, document) =>
      failure === 'query' && selector.includes('.absent')
        ? []
        : document.querySelectorAll(selector),
    first: (selector, document) => document.querySelector(selector),
  })
  state.launch.mockResolvedValue({
    newPage: async () => page,
    close: state.close,
    version: () => 'test-browser',
  })
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../../../scripts/repo/bench/native/heap-snapshot.mts')
    return session
  } finally {
    dom.window.close()
  }
}

test('native heap profiling captures each retained stage, allocations and resource cleanup', async () => {
  const originalArgs = process.argv
  process.argv = [originalArgs[0]!, 'heap.mts']
  state.values = { count: '2', queries: '3' }
  try {
    const session = await execute()
    const summary = JSON.parse(
      state.write.mock.calls.find(([file]) =>
        file.endsWith('summary.json'),
      )![1],
    )
    assert.equal(summary.count, 2)
    assert.equal(summary.queries, 3)
    assert.equal(summary.bytesPerInstance, 100)
    assert.equal(summary.bytesPerCachedSelector, 50)
    assert.equal(summary.engineSha256.length, 64)
    assert.equal(state.open.mock.calls.length, 6)
    assert.equal(state.chunk.mock.calls.length, 6)
    assert.equal(state.closeFile.mock.calls.length, 6)
    assert.equal(session.off.mock.calls.length, 6)
    assert.equal(state.close.mock.calls.length, 1)
    vi.clearAllMocks()
    state.values = {
      count: '1',
      queries: '1',
      engine: 'dist/nwsapi.js',
      'output-dir': '/fixture/custom',
    }
    await execute()
    assert.equal(state.temporary.mock.calls.length, 0)
  } finally {
    process.argv = originalArgs
  }
})

test('native heap profiling closes snapshot streams and browsers when collection fails', async () => {
  const originalArgs = process.argv
  process.argv = [originalArgs[0]!, 'heap.mts']
  state.values = { count: '1', queries: '1' }
  try {
    const failures = ['metric', 'query', 'snapshot'] as const
    for (let index = 0, length = failures.length; index < length; index += 1) {
      vi.clearAllMocks()
      await assert.rejects(execute(failures[index]))
      assert.equal(state.close.mock.calls.length, 1)
      assert.equal(
        state.closeFile.mock.calls.length,
        state.open.mock.calls.length,
      )
    }
  } finally {
    process.argv = originalArgs
  }
})

test('native heap profiling help exits before importing browser tooling', async () => {
  vi.resetModules()
  const originalArgs = process.argv
  process.argv = [originalArgs[0]!, 'heap.mts', '--help']
  const stop = new Error('exit')
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw stop
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await assert.rejects(
      import('../../../../../scripts/repo/bench/native/heap-snapshot.mts'),
      error => error === stop,
    )
    assert.equal(state.launch.mock.calls.length, 0)
  } finally {
    process.argv = originalArgs
  }
})
