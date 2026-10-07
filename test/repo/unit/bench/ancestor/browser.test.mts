import type * as Fs from 'node:fs'
import { JSDOM } from 'jsdom'
import factory from '../../../../../dist/nwsapi.js'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  write: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
  send: vi.fn(),
  mode: '',
  windows: [] as Array<{ close(): void }>,
}))
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      version: () => 'fixture-browser',
      close: state.close,
      newPage: async () => {
        const dom = new JSDOM('<!doctype html><body></body>')
        state.windows.push(dom.window)
        const engine = factory(dom.window)
        if (state.mode === 'shape' || state.mode === 'results') {
          vi.spyOn(engine, 'compile').mockReturnValue((() => []) as never)
        }
        const host = dom.window as unknown as {
          NW: { Dom: typeof engine }
          BeforeDom: typeof engine
        }
        host.NW = { Dom: engine }
        host.BeforeDom = engine
        return {
          setContent: async () => {},
          addScriptTag: async () => {},
          close: state.pageClose,
          context: () => ({
            newCDPSession: async () => ({ send: state.send }),
          }),
          evaluate: async (
            callback: (argument: never) => unknown,
            argument: never,
          ) => {
            const payload = argument as unknown as {
              selector?: string
              prefixFactory?: string
            }
            if (payload && state.mode === 'suffix' && payload.selector) {
              payload.selector += ' '
            }
            if (
              payload &&
              state.mode === 'inline-compatible' &&
              payload.prefixFactory
            ) {
              payload.prefixFactory = compatibleShared.toString()
              Object.assign(dom.window, { benchSelector: payload.selector })
            }
            vi.stubGlobal('document', dom.window.document)
            vi.stubGlobal('window', dom.window)
            const NativeWeakRef = globalThis.WeakRef
            vi.stubGlobal(
              'WeakRef',
              class {
                deref() {
                  return state.mode === 'survival' ? {} : undefined
                }
              },
            )
            try {
              return await callback(argument)
            } finally {
              vi.stubGlobal('WeakRef', NativeWeakRef)
            }
          },
        }
      },
    }),
  },
}))

function compatibleShared() {
  return [false, true].map(
    () => (nodes: Element[], _callback: null, context: Document) => {
      const selector = (window as unknown as { benchSelector: string })
        .benchSelector
      const accepted = new Set(context.querySelectorAll(selector))
      return nodes.filter(node => accepted.has(node))
    },
  )
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.mode = ''
  state.windows = []
  state.send.mockImplementation(async (command: string) =>
    command === 'Runtime.getHeapUsage'
      ? { usedSize: 100 }
      : command === 'HeapProfiler.stopSampling'
        ? {
            profile: {
              head: { selfSize: 1, children: [{ selfSize: 2, children: [] }] },
            },
          }
        : {},
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  state.windows.forEach(window => window.close())
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [
    argv[0]!,
    '/ancestor/browser.mts',
    '--iterations',
    '1',
    '--warmups',
    '1',
    '--profile-iterations',
    '1',
    ...args,
  ]
  try {
    await import('../../../../../scripts/repo/bench/ancestor/browser.mts')
  } finally {
    process.argv = argv
  }
}
test.each([
  { flags: [], count: 3 },
  { flags: ['--classes', '--single'], count: 3 },
  { flags: ['--prefix'], count: 3 },
  { flags: ['--shared'], count: 3 },
  { flags: ['--baseline', 'dist/nwsapi.js'], count: 2 },
  { flags: ['--baseline', 'dist/nwsapi.js', '--attribute-classes'], count: 2 },
])(
  'browser ancestor experiment verifies real resolver mutations $flags',
  async ({ flags, count }) => {
    await invoke(flags)
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(8)
    expect(
      report.rows.every(
        (row: {
          variants: unknown[]
          survivingNodes: number
          mutationCorrect: boolean
        }) =>
          row.variants.length === count &&
          row.survivingNodes === 0 &&
          row.mutationCorrect,
      ),
    ).toBe(true)
    expect(report.iterations).toBe(1)
    expect(state.pageClose).toHaveBeenCalledTimes(8)
    expect(state.close).toHaveBeenCalledOnce()
  },
)
test('invalid attribute comparison fails before launching', async () => {
  await expect(invoke(['--attribute-classes'])).rejects.toThrow()
  expect(state.close).not.toHaveBeenCalled()
})
test('removed-node retention failures close the page and browser', async () => {
  state.mode = 'survival'
  await expect(invoke([])).rejects.toThrow()
  expect(state.pageClose).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
  expect(state.write).not.toHaveBeenCalled()
})
test('inline experiment rejects incompatible production compiler shape', async () => {
  await expect(invoke(['--inline'])).rejects.toThrow()
  expect(state.pageClose).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
})

test.each(['shape', 'suffix', 'results'])(
  'invalid %s contracts close browser resources',
  async mode => {
    state.mode = mode
    const flags =
      mode === 'results'
        ? ['--baseline', 'dist/nwsapi.js']
        : mode === 'suffix'
          ? ['--prefix']
          : []
    await expect(invoke(flags)).rejects.toThrow()
    expect(state.pageClose).toHaveBeenCalledOnce()
    expect(state.close).toHaveBeenCalledOnce()
  },
)
test('inline caller records its mode with a compatible serialized helper', async () => {
  state.mode = 'inline-compatible'
  await invoke(['--inline'])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.rows).toHaveLength(8)
  expect(report.rows[0].variants[2].name).toBe('inline-prefix')
})
