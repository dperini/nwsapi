import type { Profiler } from 'node:inspector'
import { afterEach, beforeEach, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  read: vi.fn(),
  exec: vi.fn(),
  post: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  close: vi.fn(),
  mode: '',
  trial: 0,
  resources: [] as Response[],
  cache: { '/prepared/adapter.js': { exports: {} as unknown } },
  candidate: { name: 'candidate' },
}))
export { state }
export const profile: Profiler.Profile = {
  startTime: 0,
  endTime: 6000,
  nodes: [
    {
      id: 1,
      callFrame: {
        functionName: 'root',
        scriptId: '1',
        url: 'root',
        lineNumber: 0,
        columnNumber: 0,
      },
      children: [2, 3, 4, 5],
    },
    {
      id: 2,
      callFrame: {
        functionName: 'selector',
        scriptId: '2',
        url: '/dom-selector/index.js',
        lineNumber: 0,
        columnNumber: 0,
      },
      children: [6],
    },
    {
      id: 3,
      callFrame: {
        functionName: 'nwsapi',
        scriptId: '3',
        url: '/dist/nwsapi.js',
        lineNumber: 0,
        columnNumber: 0,
      },
    },
    {
      id: 4,
      callFrame: {
        functionName: 'adapter',
        scriptId: '4',
        url: '/dist/adapter/dom-selector.js',
        lineNumber: 0,
        columnNumber: 0,
      },
    },
    {
      id: 5,
      callFrame: {
        functionName: 'native',
        scriptId: '5',
        url: '/native.js',
        lineNumber: 0,
        columnNumber: 0,
      },
    },
    {
      id: 6,
      callFrame: {
        functionName: 'child',
        scriptId: '6',
        url: '/child.js',
        lineNumber: 0,
        columnNumber: 0,
      },
    },
  ],
  samples: [2, 3, 4, 5, 6, 6],
  timeDeltas: [1000, 1000, 1000, 1000, 1000, 0],
}
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    post = state.post
    disconnect = state.disconnect
  },
}))
type HarnessResult = { name: string; status: number; message: string }
type HarnessWindow = {
  document: { querySelectorAll: () => unknown[] }
  close: () => void
  report?: (tests: HarnessResult[], status: { status: number }) => void
}
type Options = {
  beforeParse(window: HarnessWindow): void
  resources: { interceptors: Array<(request: { url: string }) => Response> }
  virtualConsole: FixtureConsole
}
class FixtureConsole {
  callback: (error: Error) => void = () => {}
  on(_event: string, callback: (error: Error) => void) {
    this.callback = callback
    return this
  }
}
class FixtureDom {
  window: HarnessWindow = {
    document: {
      querySelectorAll: () => Array.from({ length: 100 }, () => ({})),
    },
    close: state.close,
  }
  constructor(_html: unknown, options?: Options) {
    if (!options) {
      return
    }
    options.beforeParse(this.window)
    const intercept = options.resources.interceptors[0]!
    state.resources.push(
      intercept({ url: 'https://wpt.invalid/resources/testharnessreport.js' }),
      intercept({ url: 'https://wpt.invalid/dom/common.js' }),
    )
    if (state.mode === 'foreign') {
      intercept({ url: 'https://outside.invalid/file' })
    }
    if (state.mode === 'resource') {
      intercept({ url: 'https://wpt.invalid/unknown.js' })
    }
    if (state.mode === 'error') {
      options.virtualConsole.callback(new Error('jsdom failed'))
    }
    const count = state.mode === 'count' ? 2807 : 2808
    const tests = Array.from({ length: count }, (_, index) => ({
      name: 'case' + index,
      status: state.mode === 'failure' && index === 0 ? 1 : 0,
      message: 'fixture',
    }))
    this.window.report!(tests, { status: state.mode === 'status' ? 1 : 0 })
  }
}
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(
      (file: string) => {
        if (file === './lib/api.js') {
          return {
            JSDOM: FixtureDom,
            VirtualConsole: FixtureConsole,
            requestInterceptor: (callback: unknown) => callback,
          }
        }
        if (file.endsWith('/package.json')) {
          return { version: 'fixture' }
        }
        return file.endsWith('/dist/nwsapi.js')
          ? state.candidate
          : state.cache['/prepared/adapter.js'].exports
      },
      { resolve: () => '/prepared/adapter.js', cache: state.cache },
    ),
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.mode = ''
  state.trial = 0
  state.resources = []
  state.cache['/prepared/adapter.js'].exports = { name: 'baseline' }
  state.read.mockImplementation((file: string) =>
    file.endsWith('.summary.json')
      ? JSON.stringify({
          totalSampleMs: 5,
          selectorInclusivePercent: 80,
          topSelfSamples: [],
        })
      : Buffer.from('input'),
  )
  state.exec.mockImplementation((command: string, args: string[]) => {
    if (command === 'git') {
      return 'revision\n'
    }
    const engine = args[args.indexOf('--worker') + 1]
    state.trial += 1
    return JSON.stringify({
      engine,
      range: {
        tests: 2808,
        failures: [],
        status: 0,
        durationMs: state.trial,
        errors: [],
      },
      lifecycle: {
        constructionMs: state.trial,
        firstQueryMs: 2,
        warmQueryMs: 3,
        closeMs: 4,
      },
    })
  })
  state.post.mockImplementation(async (command: string) =>
    command === 'Profiler.stop' ? { profile } : {},
  )
  vi.stubGlobal('gc', vi.fn())
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})
export async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/jsdom/workload.mts', ...args]
  try {
    return await import('../../../../../../scripts/repo/bench/jsdom/workload.mts')
  } finally {
    process.argv = argv
  }
}
