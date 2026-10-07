import { afterEach, beforeEach, vi } from 'vitest'
import type * as Fs from 'node:fs'
import type * as Os from 'node:os'
import type * as Jsdom from 'jsdom'
const state = vi.hoisted(() => ({
  failure: '',
  cpu: true,
  closed: 0,
  write: vi.fn(),
  sample: vi.fn(),
  fresh: vi.fn(),
  windows: [] as Array<{ close: () => void }>,
}))
export { state }
vi.mock('node:fs', async original => {
  const actual = await original<typeof Fs>()
  const read = (file: string) =>
    file.endsWith('first-match-results.json')
      ? JSON.stringify({
          rows: [
            { selector: '.card' },
            { selector: 'button' },
            { selector: '.missing' },
            { selector: '.absent > button' },
          ],
        })
      : Buffer.from('engine')
  const methods = {
    readFileSync: read,
    writeFileSync: state.write,
    mkdirSync: vi.fn(),
    mkdtempSync: () => '/fixture-first',
  }
  return { ...actual, ...methods, default: { ...actual, ...methods } }
})
vi.mock('node:os', async original => {
  const actual = await original<{ default: typeof Os }>()
  return {
    ...actual,
    default: {
      ...actual.default,
      cpus: () => (state.cpu ? [{ model: 'fixture' }] : []),
    },
  }
})
vi.mock('../../../../../scripts/repo/bench/documents.mts', () => ({
  components: () =>
    '<div class="card"><button class="primary" data-testid="button"></button><input class="input"></div><div class="card"><button></button></div>',
}))
vi.mock('../../../../../scripts/repo/bench/timing.mts', () => ({
  sample: state.sample,
  sampleFresh: state.fresh,
  timingEngine: { name: 'fixture', version: '1' },
}))
vi.mock('jsdom', async original => {
  const actual = await original<typeof Jsdom>()
  class FixtureDom extends actual.JSDOM {
    constructor(html: string) {
      super(html)
      const close = this.window.close.bind(this.window)
      this.window.close = () => {
        state.closed += 1
        close()
      }
      state.windows.push(this.window)
    }
  }
  return { ...actual, JSDOM: FixtureDom }
})
function engine() {
  return {
    first: (selector: string, document: Document) =>
      state.failure === 'identity' || state.failure === 'cold'
        ? null
        : document.querySelector(selector),
  }
}
vi.mock('../../../../../dist/nwsapi.js', () => ({ default: engine }))
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(
      (file: string) =>
        file.endsWith('package.json') ? { version: 'fixture' } : engine,
      { resolve: () => '/fixture/jsdom.js' },
    ),
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.failure = ''
  state.cpu = true
  state.closed = 0
  state.sample.mockImplementation(async (callback: () => unknown) => {
    if (state.failure === 'warm') {
      state.failure = 'identity'
    }
    callback()
    return { milliseconds: 1 + state.sample.mock.calls.length }
  })
  state.fresh.mockImplementation(
    async (setup: () => unknown, query: (context: unknown) => void) => {
      const context = setup()
      query(context)
      return 1
    },
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  state.windows.forEach(window => window.close())
  state.windows.length = 0
})
export async function invoke(name: string, args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, `/first/${name}.mts`, ...args]
  try {
    await import(`../../../../../scripts/repo/bench/first/${name}.mts`)
  } finally {
    process.argv = argv
  }
}
