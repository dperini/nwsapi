import assert from 'node:assert/strict'
import type * as fs from 'node:fs'
import type * as util from 'node:util'
import { JSDOM } from 'jsdom'
import { afterEach, test, vi } from 'vitest'
import type {
  NativeContext,
  NativeGlobals,
} from '../../../../../scripts/repo/bench/native/host.mts'

const state = vi.hoisted(() => ({
  values: {
    count: '2',
    queries: '3',
    rounds: '1',
    output: '/output/memory.json',
    help: false,
  },
  write: vi.fn(),
  mkdir: vi.fn(),
  launch: vi.fn(),
  page: vi.fn(),
}))
vi.mock('node:util', async importOriginal => ({
  ...(await importOriginal<typeof util>()),
  parseArgs: () => ({ values: state.values }),
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof fs>()),
  writeFileSync: state.write,
  mkdirSync: state.mkdir,
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: state.launch } }))
vi.mock('../../../../../scripts/repo/bench/native/host.mts', () => ({
  nativeSources: async () => ({ competitorBundleSha256: 'bundle' }),
  nativePage: state.page,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function run(failure: 'none' | 'heap' | 'query' | 'roots' = 'none') {
  vi.resetModules()
  const dom = new JSDOM('<body></body>')
  const frames: JSDOM[] = []
  const close = vi.fn()
  let metrics = 0
  const session = {
    send: vi.fn(async (method: string) => {
      if (method !== 'Performance.getMetrics') {
        return {}
      }
      metrics += 1
      return {
        metrics:
          failure === 'heap'
            ? []
            : [
                {
                  name: 'JSHeapUsedSize',
                  value: [1000, 1200, 1500][(metrics - 1) % 3],
                },
              ],
      }
    }),
  }
  const page = {
    close: vi.fn(),
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async <Input, Output>(
      callback: (input: Input) => Output,
      input: Input,
    ) => {
      const result = await callback(input)
      return failure === 'roots' && typeof result === 'number' ? 0 : result
    },
  }
  const host = {
    __createContext(html: string): NativeContext {
      const inner = new JSDOM(html)
      frames.push(inner)
      return {
        frame: {
          contentWindow: inner.window,
          remove() {},
        } as unknown as HTMLIFrameElement,
        document: inner.window.document,
        all: selector => inner.window.document.querySelectorAll(selector),
        first: selector => inner.window.document.querySelector(selector),
      }
    },
    __nwsapiFactory: () => ({
      select: (selector: string, document: Document) =>
        failure === 'query' ? [] : document.querySelectorAll(selector),
      first: (selector: string, document: Document) =>
        document.querySelector(selector),
    }),
    __competitor: {
      DOMSelector: class {
        querySelectorAll(selector: string, document: Document) {
          return Array.from(document.querySelectorAll(selector))
        }
        querySelector(selector: string, document: Document) {
          return document.querySelector(selector)
        }
      },
    },
  } as NativeGlobals
  state.launch.mockResolvedValue({ close, version: () => 'test' })
  state.page.mockResolvedValue(page)
  vi.stubGlobal('window', host)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../../../scripts/repo/bench/native/memory.mts')
    return { close, page, session }
  } finally {
    assert.equal(close.mock.calls.length, state.values.help ? 0 : 1)
    for (let index = 0, length = frames.length; index < length; index += 1) {
      frames[index]!.window.close()
    }
    dom.window.close()
  }
}

test('native memory measures retained initialization and query-cache deltas per document', async () => {
  state.values.help = false
  const { page, session } = await run()
  const report = JSON.parse(state.write.mock.calls[0]![1])
  assert.equal(report.metadata.count, 2)
  assert.equal(report.metadata.queries, 3)
  assert.equal(report.rows.length, 2)
  assert.deepEqual(report.rows[0].initialized, {
    median: 100,
    min: 100,
    max: 100,
    samples: [100],
  })
  assert.equal(report.rows[0].queried.median, 250)
  assert.equal(report.rows[0].cacheGrowth.median, 150)
  assert.equal(page.close.mock.calls.length, 2)
  assert.equal(
    session.send.mock.calls.filter(
      ([method]) => method === 'HeapProfiler.collectGarbage',
    ).length,
    24,
  )
})

test('native memory closes browser resources on missing metrics, incorrect results and missing roots', async () => {
  state.values.help = false
  const failures = ['heap', 'query', 'roots'] as const
  for (let index = 0, length = failures.length; index < length; index += 1) {
    await assert.rejects(run(failures[index]))
  }
})

test('native memory help avoids starting a browser', async () => {
  state.values.help = true
  await run()
  assert.equal(state.launch.mock.calls.length, 0)
  state.values.help = false
})
