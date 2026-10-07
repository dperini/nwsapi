import type * as Jsdom from 'jsdom'
import { afterEach, beforeEach, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  report: vi.fn(),
  compile: vi.fn(),
  configure: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
  domClose: vi.fn(),
  exec: vi.fn(),
  mode: '',
  bytes: true,
  retained: false,
  time: 0,
  windows: [] as Array<{ close(): void }>,
}))
export { state }
vi.mock('node:fs', () => ({
  readFileSync: () => Buffer.from('engine'),
  writeFileSync: state.write,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('node:module', () => ({ createRequire: () => () => factory }))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('../../../../../scripts/repo/bench/port/cases.mts', () => ({
  cases: [
    {
      name: 'select',
      selector: '.hit',
      markup:
        '<!doctype html><main><span class="leaf hit"></span><span class="hit"></span></main>',
    },
    {
      name: 'fallback',
      selector: '.missing',
      markup: '<!doctype html><section></section>',
    },
    {
      name: 'match',
      selector: 'section',
      target: 'section',
      match: true,
      markup: '<!doctype html><section></section>',
    },
    {
      name: 'match miss',
      selector: '.missing',
      match: true,
      markup: '<!doctype html><span class="leaf"></span>',
    },
  ],
}))
vi.mock('../../../../../scripts/repo/bench/port/report.mts', () => ({
  writeTimingReport: state.report,
}))
vi.mock('../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: async (queries: Array<() => unknown>) =>
    queries.map(query => {
      query()
      return [{ p50Ns: 100, samplesNs: [100] }]
    }),
}))
vi.mock('jsdom', async () => {
  const actual = await vi.importActual<typeof Jsdom>('jsdom')
  return {
    ...actual,
    JSDOM: class extends actual.JSDOM {
      constructor(...args: ConstructorParameters<typeof actual.JSDOM>) {
        super(...args)
        const close = this.window.close.bind(this.window)
        this.window.close = () => {
          state.domClose()
          close()
        }
        state.windows.push(this.window)
      }
    },
  }
})
export function factory(host: { document: Document }) {
  return {
    match: (selector: string, element: Element) =>
      state.mode === 'wrong' ? false : element.matches(selector),
    select: (selector: string, context: Document | Element) => {
      if (state.mode === 'boolean') {
        return true
      }
      const nodes = Array.from(context.querySelectorAll(selector))
      if (state.mode === 'length') {
        return []
      }
      return state.mode === 'order' ? nodes.toReversed() : nodes
    },
    compile: state.compile,
    configure: state.configure,
    matchLambdas: {
      size: () => 1800,
      ...(state.bytes ? { bytes: () => 300 } : {}),
    },
    document: host.document,
  }
}
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      version: () => 'fixture',
      close: state.close,
      newPage: async () => {
        const { JSDOM } = await import('jsdom')
        const dom = new JSDOM('<!doctype html><main/>')
        Object.assign(dom.window, { NW: { Dom: factory(dom.window) } })
        return {
          setContent: async () => {},
          addScriptTag: async () => {},
          close: state.pageClose,
          evaluate: async (callback: (arg: never) => unknown, arg: never) => {
            vi.stubGlobal('window', dom.window)
            vi.stubGlobal('document', dom.window.document)
            return callback(arg)
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
  state.bytes = true
  state.retained = false
  state.time = 0
  state.windows = []
  state.exec.mockReturnValue(JSON.stringify({ retained: 100, cleared: 0 }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(performance, 'now').mockImplementation(() => {
    state.time += 50
    return state.time
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  state.windows.forEach(window => window.close())
})
export async function invoke(
  name: 'browser' | 'run' | 'memory',
  args: string[],
) {
  const argv = process.argv
  process.argv = [argv[0]!, `/port/${name}.mts`, ...args]
  try {
    if (name === 'browser') {
      await import('../../../../../scripts/repo/bench/port/browser.mts')
    } else if (name === 'run') {
      await import('../../../../../scripts/repo/bench/port/run.mts')
    } else {
      await import('../../../../../scripts/repo/bench/port/memory.mts')
    }
  } finally {
    process.argv = argv
  }
}
