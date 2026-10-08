import type Adapter from '../../../../../../dist/adapter/dom-selector.js'
import type * as Module from 'node:module'
import type * as Jsdom from 'jsdom'
import { ADAPTER_BUILD_PATH } from '../../../../../../scripts/repo/lib/paths.mts'
import { afterEach, beforeEach, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  load: vi.fn(),
  compare: vi.fn(),
  domClose: vi.fn(),
  mode: '',
  options: [] as unknown[],
}))
export { state }
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
      }
    },
  }
})
vi.mock('node:fs', () => ({
  readFileSync: () => Buffer.from('engine'),
  writeFileSync: state.write,
}))
vi.mock('../../../../../../scripts/repo/bench/documents.mts', () => ({
  components: () =>
    '<main id="root"><button data-testid="btn-150"></button><button data-testid="other"></button></main>',
}))
vi.mock('../../../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: state.compare,
}))
vi.mock('node:module', async () => {
  const actual = await vi.importActual<typeof Module>('node:module')
  const load = actual.createRequire(import.meta.url)
  const Actual = load(ADAPTER_BUILD_PATH) as typeof Adapter
  class FixtureAdapter extends Actual {
    constructor(...args: ConstructorParameters<typeof Adapter>) {
      state.options.push(args[2])
      super(...args)
    }
    override querySelectorAll(
      ...args: Parameters<Adapter['querySelectorAll']>
    ) {
      const result = super.querySelectorAll(...args)
      if (
        (state.mode === 'initial' && result.length === 32) ||
        (state.mode === 'mutation' && result.length === 31)
      ) {
        return []
      }
      return state.mode === 'order' ? Array.from(result).toReversed() : result
    }
  }
  return {
    createRequire: () => (file: string) => {
      state.load(file)
      if (file.endsWith('dom-selector.js')) {
        return FixtureAdapter
      }
      if (file.endsWith('/package.json')) {
        return { version: 'fixture' }
      }
      return load(file)
    },
  }
})
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.mode = ''
  state.options = []
  state.compare.mockImplementation(async (queries: Array<() => unknown>) =>
    queries.map(query => {
      query()
      return [{ p50Ns: 100, samplesNs: [100] }]
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})
export async function invoke(name: 'timing' | 'retention', args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, `/reader/${name}.mts`, ...args]
  try {
    if (name === 'timing') {
      await import('../../../../../../scripts/repo/bench/jsdom/reader/timing.mts')
    } else {
      await import('../../../../../../scripts/repo/bench/jsdom/reader/retention.mts')
    }
  } finally {
    process.argv = argv
  }
}
