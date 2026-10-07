import type * as Fs from 'node:fs'
import { JSDOM } from 'jsdom'
import factory from '../../../../../dist/nwsapi.js'
import { afterEach, beforeEach, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  memory: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
  mode: '',
  time: 0,
  windows: [] as Array<{ close(): void }>,
}))
export { state }
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('../../../../../scripts/repo/bench/ancestor/memory.mts', () => ({
  profileAncestorMemory: state.memory,
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      version: () => 'fixture',
      close: state.close,
      newPage: async () => {
        let dom: JSDOM
        return {
          setContent: async (html: string) => {
            dom = new JSDOM(html)
            state.windows.push(dom.window)
          },
          addScriptTag: async () => {
            const engine = factory(dom.window)
            if (state.mode) {
              const original = engine.select.bind(undefined)
              vi.spyOn(engine, 'select').mockImplementation(
                (selector, context, callback) => {
                  const selected = original(selector, context, callback)
                  return state.mode === 'length'
                    ? []
                    : Array.from(selected).toReversed()
                },
              )
            }
            Object.assign(dom.window, { NW: { Dom: engine } })
          },
          close: () => {
            state.pageClose()
            dom.window.close()
          },
          evaluate: async (
            callback: (argument: never) => unknown,
            argument: never,
          ) => {
            vi.stubGlobal('window', dom.window)
            vi.stubGlobal('document', dom.window.document)
            return callback(argument)
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
  state.time = 0
  state.windows = []
  state.memory.mockResolvedValue({ variants: [] })
  vi.spyOn(performance, 'now').mockImplementation(() => {
    state.time += 50
    return state.time
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  state.windows.forEach(window => window.close())
})
export async function invoke(name: 'browser' | 'node', args: string[]) {
  const argv = process.argv
  process.argv = [
    argv[0]!,
    `/result-array/${name}.mts`,
    ...args,
    '--warmups',
    '1',
    '--batch',
    '1',
  ]
  try {
    if (name === 'browser') {
      await import('../../../../../scripts/repo/bench/result-array/browser.mts')
    } else {
      await import('../../../../../scripts/repo/bench/result-array/node.mts')
    }
  } finally {
    process.argv = argv
  }
}
