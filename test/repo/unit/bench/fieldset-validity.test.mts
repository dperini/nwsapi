import type * as Fs from 'node:fs'
import { JSDOM } from 'jsdom'
import factory from '../../../../dist/nwsapi.js'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  close: vi.fn(),
  mode: '',
  windows: [] as Array<{ close(): void }>,
}))
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
}))
vi.mock('../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
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
          addScriptTag: async () => {},
          evaluate: async (
            callback: (queries: string[]) => unknown,
            queries: string[],
          ) => {
            const engine = factory(dom.window)
            vi.stubGlobal('NW', {
              Dom: {
                select: (selector: string) =>
                  state.mode === 'engine'
                    ? []
                    : engine.select(selector, dom.window.document),
              },
            })
            const ids: Record<string, string[]> = {
              'input:disabled': ['filled', 'empty'],
              'input:valid': ['legend'],
              'input:invalid': [],
            }
            const document = Object.create(dom.window.document)
            document.querySelectorAll = (selector: string) =>
              state.mode === 'native'
                ? []
                : ids[selector]!.map(id =>
                    dom.window.document.getElementById(id)!,
                  )
            vi.stubGlobal('document', document)
            return callback(queries)
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
  state.windows = []
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  state.windows.forEach(window => window.close())
})
test('fieldset probe records disabled controls and first-legend validity', async () => {
  await import('../../../../scripts/repo/bench/fieldset-validity.mts')
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.jsdom.map((row: { engine: string[] }) => row.engine)).toEqual([
    ['filled', 'empty'],
    ['legend'],
    [],
  ])
  expect(
    report.chromium.map((row: { host: string[]; engine: string[] }) => [
      row.host,
      row.engine,
    ]),
  ).toEqual([
    [
      ['filled', 'empty'],
      ['filled', 'empty'],
    ],
    [['legend'], ['legend']],
    [[], []],
  ])
  expect(report.engineHash).toHaveLength(64)
  expect(state.close).toHaveBeenCalledOnce()
})
test.each(['native', 'engine'])(
  'fieldset probe rejects incorrect %s results',
  async mode => {
    state.mode = mode
    await expect(
      import('../../../../scripts/repo/bench/fieldset-validity.mts'),
    ).rejects.toThrow()
    expect(state.close).toHaveBeenCalledOnce()
    expect(state.write).not.toHaveBeenCalled()
  },
)
