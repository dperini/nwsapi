import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
  failure: '',
  rounds: '1',
}))
vi.mock('node:fs', () => ({
  readFileSync: () => 'fixture',
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      close: state.close,
      version: () => 'fixture',
      newPage: async () => ({
        close: state.pageClose,
        setContent: async () => undefined,
        addScriptTag: async () => undefined,
        context: () => ({
          newCDPSession: async () => ({
            send: async (method: string) =>
              method === 'HeapProfiler.stopSampling'
                ? {
                    profile: {
                      head: {
                        selfSize: 10,
                        callFrame: { functionName: 'root' },
                        children: [
                          {
                            selfSize: 20,
                            callFrame: { functionName: 'collectionCopy' },
                            children: [
                              {
                                selfSize: 5,
                                callFrame: { functionName: 'other' },
                                children: [],
                              },
                            ],
                          },
                        ],
                      },
                    },
                  }
                : { usedSize: 1000 },
          }),
        }),
        evaluate: async (callback: (arg: unknown) => unknown, arg?: unknown) =>
          callback(arg),
      }),
    }),
  },
}))
const argv = process.argv.slice()
let dom: JSDOM
beforeEach(() => {
  vi.resetModules()
  state.write.mockClear()
  state.close.mockClear()
  state.pageClose.mockClear()
  state.failure = ''
  dom = new JSDOM('<body></body>')
  let hits = 0
  const host = {
    NW: {
      Dom: {
        select: (selector: string, doc: Document) =>
          doc.querySelectorAll(selector),
        Snapshot: {
          has: (selector: string) => {
            if (selector.startsWith('[data-miss')) {
              return state.failure === 'churn'
            }
            hits += 1
            return (
              state.failure !== 'warm' &&
              (state.failure !== 'measurement' || hits <= 100)
            )
          },
        },
        configure: vi.fn(),
      },
    },
  }
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('window', host)
  vi.stubGlobal(
    'WeakRef',
    class {
      target: Element
      constructor(target: Element) {
        this.target = target
      }
      deref() {
        return state.failure === 'retained' ? this.target : undefined
      }
    },
  )
  vi.stubGlobal('setTimeout', (callback: () => void) => {
    callback()
    return 1
  })
  process.argv = [
    argv[0]!,
    'memory.mts',
    '--baseline',
    '/fixture/baseline',
    '--rounds',
    '1',
  ]
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  dom.window.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function run() {
  await import('../../../../../scripts/repo/bench/has/memory.mts')
}
test('records rotating retained heap stages and nested allocation sites', async () => {
  await run()
  const report = JSON.parse(state.write.mock.calls[0]![1])
  expect(report.samples).toHaveLength(2)
  expect(
    report.samples.map((sample: { engine: number }) => sample.engine),
  ).toEqual([0, 1])
  expect(report.samples[0]).toMatchObject({
    sampledBytes: 35,
    collectionCopyBytes: 25,
    survivingNodes: 0,
  })
  expect(state.pageClose).toHaveBeenCalledTimes(2)
  expect(state.close).toHaveBeenCalledOnce()
})
test.each(['warm', 'measurement', 'churn', 'retained'])(
  'closes resources after unsafe %s results',
  async failure => {
    state.failure = failure
    await expect(run()).rejects.toBeInstanceOf(Error)
    expect(state.pageClose).toHaveBeenCalledOnce()
    expect(state.close).toHaveBeenCalledOnce()
    expect(state.write).not.toHaveBeenCalled()
  },
)
test.each(['0', '11', '1.5'])('rejects invalid round count %s', async value => {
  process.argv[process.argv.length - 1] = value
  await expect(run()).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
  expect(state.close).not.toHaveBeenCalled()
})
test('requires baseline', async () => {
  process.argv = [argv[0]!, 'memory.mts']
  await expect(run()).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
})
