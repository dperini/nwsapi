import { afterEach, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
const state = vi.hoisted(() => ({
  mode: '',
  profile: 'normal',
  after: false,
  write: vi.fn(),
  disconnect: vi.fn(),
  post: vi.fn(),
  compare: vi.fn(),
  close: vi.fn(),
  detach: vi.fn(),
  send: vi.fn(),
  pageClose: vi.fn(),
  windows: [] as Array<{ close: () => void }>,
}))
export { state }
vi.mock('node:fs', () => ({
  readFileSync: () => Buffer.from('engine'),
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/bench/documents.mts', () => ({
  components: () =>
    '<main id="root"><button data-testid="btn-150"></button><button data-testid="other"></button></main>',
}))
vi.mock('../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.compare,
}))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/chrome' }),
}))
function select(selector: string, context: Document | Element) {
  const nodes = Array.from(context.querySelectorAll(selector))
  const mode = state.after ? state.mode.replace('after-', '') : state.mode
  if (mode === 'length') {
    return []
  }
  if (mode === 'order') {
    return nodes.toReversed()
  }
  return nodes
}
function factory() {
  return { select }
}
class Adapter {
  querySelectorAll = select
}
vi.mock('../../../../../dist/nwsapi.js', () => ({ default: factory }))
vi.mock('../../../../../dist/adapter/dom-selector.js', () => ({
  default: Adapter,
}))
vi.mock('node:module', () => ({
  createRequire: () => (file: string) =>
    file.endsWith('dom-selector.js') ? Adapter : factory,
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect() {}
    post = state.post
    disconnect = state.disconnect
  },
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      version: () => 'fixture-chrome',
      close: state.close,
      newPage: async () => {
        const dom = new JSDOM('<body></body>')
        state.windows.push(dom.window)
        return {
          setContent: async () => {},
          addScriptTag: async () => {},
          close: state.pageClose,
          context: () => ({
            newCDPSession: async () => ({
              send: state.send,
              detach: state.detach,
            }),
          }),
          evaluate: async (callback: () => unknown) => {
            vi.stubGlobal('document', dom.window.document)
            vi.stubGlobal('window', dom.window)
            vi.stubGlobal('NW', {
              Dom: {
                select: (selector: string, root: Document | Element) => {
                  const nodes = Array.from(root.querySelectorAll(selector))
                  if (state.mode === 'initial' && selector === '[data-hit]') {
                    return []
                  }
                  if (state.mode === 'mutation' && nodes.length === 31) {
                    return []
                  }
                  return nodes
                },
              },
            })
            const NativeWeakRef = globalThis.WeakRef
            vi.stubGlobal(
              'WeakRef',
              class {
                private value: object
                constructor(value: object) {
                  this.value = value
                }
                deref() {
                  return state.mode === 'survival' ? this.value : undefined
                }
              },
            )
            try {
              return callback()
            } finally {
              vi.stubGlobal('WeakRef', NativeWeakRef)
            }
          },
        }
      },
    }),
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.mode = ''
  state.profile = 'normal'
  state.after = false
  state.post.mockImplementation(async (command: string) => {
    if (command !== 'Profiler.stop') {
      return {}
    }
    state.after = true
    return {
      profile: {
        samples:
          state.profile === 'missing'
            ? undefined
            : state.profile === 'empty'
              ? []
              : [1, 2, 3],
        nodes: [
          {
            hitCount: 1,
            callFrame: {
              functionName: 'first',
              url: process.cwd() + '/first.mts',
              lineNumber: 0,
            },
          },
          {
            hitCount: 2,
            callFrame: {
              functionName: 'second',
              url: 'external.mts',
              lineNumber: 1,
            },
          },
          {
            hitCount: 0,
            callFrame: {
              functionName: 'unused',
              url: 'unused.mts',
              lineNumber: 2,
            },
          },
        ],
      },
    }
  })
  state.compare.mockImplementation(async (callbacks: Array<() => unknown>) => {
    callbacks.forEach(callback => callback())
    return [1, 2]
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  state.windows.forEach(window => window.close())
  state.windows.length = 0
})
export async function invoke(name: string, args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, `/attribute/${name}.mts`, ...args]
  try {
    if (name === 'mutation') {
      await import('../../../../../scripts/repo/bench/attribute/mutation.mts')
    } else if (name === 'identity/timing') {
      await import('../../../../../scripts/repo/bench/attribute/identity/timing.mts')
    } else {
      await import('../../../../../scripts/repo/bench/attribute/identity/browser-retention.mts')
    }
  } finally {
    process.argv = argv
  }
}
