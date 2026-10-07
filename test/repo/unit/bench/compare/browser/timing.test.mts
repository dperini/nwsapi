import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  failure: '',
  measured: false,
  closed: vi.fn(),
  detached: vi.fn(),
  pageClosed: vi.fn(),
  bundleClosed: vi.fn(),
  write: vi.fn(),
  output: [{ type: 'chunk', imports: [], code: 'timing' }] as Array<{
    type: string
    imports: string[]
    code: string
  }>,
  gc: vi.fn(),
}))
vi.mock('node:fs', () => ({ readFileSync: () => 'engine' }))
vi.mock('../../../../../../scripts/repo/bench/compare/options.mts', () => ({
  options: () => state.config,
  metadata: () => ({ fixture: true }),
  writeReport: state.write,
}))
vi.mock(
  '../../../../../../scripts/repo/bench/compare/browser/memory.mts',
  () => ({ profileBrowserMemory: async () => ['heap'] }),
)
vi.mock('rolldown', () => ({
  rolldown: async () => ({
    generate: async () => ({ output: state.output }),
    close: state.bundleClosed,
  }),
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      version: () => 'fixture-browser',
      close: state.closed,
      newPage: async () => {
        let dom: JSDOM
        return {
          route: async (
            _url: string,
            handler: (route: unknown) => Promise<void>,
          ) =>
            handler({
              fulfill: async ({
                body,
                headers,
              }: {
                body: string
                headers: Record<string, string>
              }) => {
                assert.equal(
                  headers['Cross-Origin-Embedder-Policy'],
                  'require-corp',
                )
                dom = new JSDOM(
                  state.failure === 'fixture' ? '<main></main>' : body,
                )
                vi.stubGlobal('window', dom.window)
                vi.stubGlobal('document', dom.window.document)
                vi.stubGlobal(
                  'crossOriginIsolated',
                  state.failure !== 'isolation',
                )
                vi.stubGlobal('performance', {
                  now: () => 1,
                  memory:
                    state.failure === 'memory'
                      ? undefined
                      : { usedJSHeapSize: 10 },
                })
              },
            }),
          goto: async () => {},
          evaluate: async (fn: (value?: unknown) => unknown, value?: unknown) =>
            fn(value),
          addScriptTag: async ({ content }: { content: string }) => {
            const host = dom.window as unknown as Record<string, unknown>
            if (content === 'timing') {
              host['gc'] = state.failure === 'gc' ? undefined : state.gc
              host['__mitataComparison'] = {
                compareTiming: async (
                  queries: Array<() => unknown>,
                  _settings: unknown,
                  heap?: { gc: () => void; read: () => number },
                ) => {
                  queries.map(query => query())
                  if (heap) {
                    heap.gc()
                    assert.equal(heap.read(), 10)
                  }
                  state.measured = true
                  return ['round']
                },
              }
            } else {
              host['NW'] = {
                Dom: {
                  select: (selector: string, document: Document) => {
                    const nodes = Array.from(
                      document.querySelectorAll(selector),
                    )
                    if (
                      state.failure === 'initial-length' ||
                      (state.measured && state.failure === 'changed-length')
                    ) {
                      return []
                    }
                    if (
                      state.failure === 'initial-identity' ||
                      (state.measured && state.failure === 'changed-identity')
                    ) {
                      return nodes.map(node => node.cloneNode())
                    }
                    return nodes
                  },
                },
              }
            }
          },
          context: () => ({
            newCDPSession: async () => ({ detach: state.detached }),
          }),
          close: async () => {
            state.pageClosed()
            dom?.window.close()
          },
        }
      },
    }),
  },
}))

test('browser comparison validates fixtures, isolated timings, memory prerequisites and complete cleanup', async () => {
  state.config = {
    paths: ['baseline', 'candidate'],
    counts: [1],
    groups: 2,
    scenario: 'grouped',
    layout: 'adjacent',
    mode: 'timing',
    settings: { rounds: 1 },
    output: 'report',
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const load = async () => {
    vi.resetModules()
    state.measured = false
    try {
      await import('../../../../../../scripts/repo/bench/compare/browser/timing.mts')
    } finally {
      vi.unstubAllGlobals()
    }
  }
  await load()
  const first = state.write.mock.calls[0]![1]
  assert.equal(first.heapProvider, null)
  assert.equal(first.browser, 'fixture-browser')
  assert.equal(first.crossOriginIsolated, true)
  assert.ok(first.rows.length > 0)
  state.config['mode'] = 'memory'
  await load()
  assert.deepEqual(state.write.mock.calls[1]![1].rows[0].memory, ['heap'])
  assert.ok(state.gc.mock.calls.length > 0)
  const failures = [
    'gc',
    'memory',
    'isolation',
    'fixture',
    'initial-length',
    'initial-identity',
    'changed-length',
    'changed-identity',
  ]
  for (let index = 0, length = failures.length; index < length; index += 1) {
    state.failure = failures[index]!
    await assert.rejects(load())
  }
  assert.equal(state.closed.mock.calls.length, 10)
  assert.equal(state.pageClosed.mock.calls.length, 10)
  state.failure = ''
  const invalid = [
    [],
    [{ type: 'asset', imports: [], code: 'timing' }],
    [{ type: 'chunk', imports: ['external'], code: 'timing' }],
  ]
  for (let index = 0, length = invalid.length; index < length; index += 1) {
    state.output = invalid[index]!
    await assert.rejects(load())
  }
  assert.equal(state.bundleClosed.mock.calls.length, 13)
  assert.equal(state.write.mock.calls.length, 2)
})
