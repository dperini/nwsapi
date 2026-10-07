import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  launch: vi.fn(),
  close: vi.fn(),
  write: vi.fn(),
  mode: '',
  active: false,
  states: new Set<string>(),
  nodes: [{ id: 'one' }, { id: 'two' }],
}))
vi.mock('node:fs', () => ({
  readFileSync: () => 'engine',
  writeFileSync: state.write,
}))
vi.mock('../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/managed-browser' }),
}))
function native(selector: string) {
  if (selector === '::column') {
    return state.mode === 'order' ? state.nodes : []
  }
  const matched =
    selector === ':state(initial)' ? state.states.has('initial') : state.active
  return matched ? [state.nodes[0]!] : []
}
vi.mock('@playwright/test', () => ({ chromium: { launch: state.launch } }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.mode = ''
  state.active = false
  state.states = new Set()
  state.launch.mockResolvedValue({
    version: () => 'fixture',
    close: state.close,
    newPage: async () => ({
      setContent: async () => {},
      addScriptTag: async () => {},
      evaluate: async (callback: () => unknown) => {
        vi.stubGlobal('NW', {
          Dom: {
            select: (selector: string) =>
              state.mode === 'length'
                ? [state.nodes[0]]
                : state.mode === 'order'
                  ? native(selector).toReversed()
                  : native(selector),
          },
        })
        vi.stubGlobal(
          'HTMLElement',
          class {
            attachInternals() {
              return { states: state.states }
            }
          },
        )
        vi.stubGlobal('customElements', {
          define: (_name: string, Constructor: new () => unknown) => {
            Reflect.set(state, 'instance', new Constructor())
          },
        })
        vi.stubGlobal('document', {
          querySelectorAll: native,
          startViewTransition: ({ update }: { update: () => void }) => {
            update()
            state.active = true
            return {
              ready: Promise.resolve(),
              finished: Promise.resolve(),
              skipTransition: () => {
                state.active = false
              },
            }
          },
        })
        return callback()
      },
    }),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/browser-syntax.mts', ...args]
  try {
    await import('../../../../scripts/repo/bench/browser-syntax.mts')
  } finally {
    process.argv = argv
  }
}
test.each([false, true])(
  'syntax probe tracks state and transition lifecycles explicitBrowser=%s',
  async explicit => {
    await invoke(explicit ? ['/custom-browser'] : [])
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows.map((row: { matches: number }) => row.matches)).toEqual([
      0, 1, 1, 0, 0,
    ])
    expect(state.launch).toHaveBeenCalledWith({
      executablePath: explicit ? '/custom-browser' : '/managed-browser',
    })
    expect(state.close).toHaveBeenCalledOnce()
  },
)
test.each(['length', 'order'])(
  'syntax probe rejects %s mismatches and closes the browser',
  async mode => {
    state.mode = mode
    await expect(invoke([])).rejects.toThrow()
    expect(state.write).not.toHaveBeenCalled()
    expect(state.close).toHaveBeenCalledOnce()
  },
)
