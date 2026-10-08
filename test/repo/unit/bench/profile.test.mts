import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  post: vi.fn(),
  missing: false,
  samples: 'normal',
  calls: { select: 0, first: 0, match: 0, compile: 0 },
  lastSelector: '',
}))
vi.mock('node:fs', () => ({
  mkdtempSync: () => '/profile',
  readFileSync: () => Buffer.from('engine'),
  writeFileSync: state.write,
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    disconnect = state.disconnect
    post = state.post
  },
}))
vi.mock('../../../../scripts/repo/bench/documents.mts', () => ({
  DOCUMENTS: {
    components: {
      html: () =>
        '<main class="card"><button class="primary"></button><input class="input"></main>',
    },
    atomic: { html: () => '<aside/>' },
  },
}))
vi.mock('../../../../scripts/repo/bench/cases.mts', () => ({
  cases: { components: { basic: ['.card'] }, atomic: { basic: ['aside'] } },
}))
vi.mock('../../../../dist/nwsapi.js', () => ({
  default: () => ({
    compile: (selector: string) => {
      state.calls.compile += 1
      state.lastSelector = selector
      return state.missing ? undefined : (nodes: Element[]) => nodes
    },
    select: () => {
      state.calls.select += 1
      return [1]
    },
    first: () => {
      state.calls.first += 1
      return {}
    },
    match: () => {
      state.calls.match += 1
      return true
    },
  }),
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.missing = false
  state.samples = 'normal'
  state.calls = { select: 0, first: 0, match: 0, compile: 0 }
  state.lastSelector = ''
  state.post.mockImplementation(async (command: string) =>
    command === 'Profiler.stop'
      ? {
          profile: {
            samples:
              state.samples === 'missing'
                ? undefined
                : state.samples === 'empty'
                  ? []
                  : [1, 1, 2],
            nodes: [
              {
                id: 1,
                callFrame: {
                  functionName: 'query',
                  url: new URL('../../../../engine.mjs', import.meta.url).href,
                  lineNumber: 0,
                },
              },
              {
                id: 2,
                callFrame: {
                  functionName: 'read',
                  url: 'native',
                  lineNumber: 1,
                },
              },
              {
                id: 3,
                callFrame: {
                  functionName: 'unused',
                  url: 'native',
                  lineNumber: 2,
                },
              },
            ],
          },
        }
      : {},
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/profile.mts', ...args]
  try {
    await import('../../../../scripts/repo/bench/profile.mts')
  } finally {
    process.argv = argv
  }
}
test.each(['select', 'first', 'first-class', 'match', 'cold', 'resolver'])(
  'profiler dispatches %s phase and records source consumption',
  async phase => {
    const log = vi.spyOn(console, 'log')
    await invoke([phase, '/out.cpuprofile'])
    const report = JSON.parse(log.mock.calls[0]![0] as string)
    expect(report.phase).toBe(phase)
    expect(report.consumed).toBeGreaterThan(0)
    expect(report.sourceSha256).toHaveLength(64)
    expect(report.top[0].samples).toBe(2)
    expect(state.disconnect).toHaveBeenCalledOnce()
    expect(
      state.calls[
        phase === 'first-class'
          ? 'first'
          : phase === 'cold' || phase === 'resolver'
            ? 'compile'
            : (phase as 'select' | 'first' | 'match')
      ],
    ).toBeGreaterThan(0)
    if (phase === 'cold') {
      expect(state.lastSelector).toContain(':not(.profile-999)')
    }
  },
)
test.each(['cold', 'resolver'])(
  'missing compiled resolvers use %s fallback',
  async phase => {
    state.missing = true
    await invoke([phase, '/out'])
    expect(state.write).toHaveBeenCalledOnce()
  },
)
test.each(['missing', 'empty'])(
  'default profiler tolerates %s sampling data',
  async samples => {
    state.samples = samples
    const log = vi.spyOn(console, 'log')
    await invoke([])
    const report = JSON.parse(log.mock.calls[0]![0] as string)
    expect(report.phase).toBe('select')
    expect(report.output).toBe('/profile/nwsapi.cpuprofile')
    expect(
      report.top.every((node: { samples: number }) => node.samples === 0),
    ).toBe(true)
  },
)
test('profiler failure disconnects the inspector', async () => {
  state.post.mockRejectedValue(new Error('profiler failed'))
  await expect(invoke(['first'])).rejects.toThrow()
  expect(state.disconnect).toHaveBeenCalledOnce()
})
test.each(['--help', '-h'])(
  'help %s exits before inspector setup',
  async flag => {
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw Object.assign(new Error(), { code: 'TEST_EXIT' })
    })
    await expect(invoke([flag])).rejects.toMatchObject({ code: 'TEST_EXIT' })
    expect(state.connect).not.toHaveBeenCalled()
  },
)
