import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as NodeFs from 'node:fs'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  error: false,
  mismatch: '',
  closes: vi.fn(),
  detach: vi.fn(),
  source: { competitor: '' },
}))
vi.mock('node:fs', async original => ({
  ...(await original<typeof NodeFs>()),
  readFileSync: () => 'baseline',
  writeFileSync: state.write,
}))
vi.mock('../../../../scripts/repo/bench/documents.mts', () => ({
  components: () => '<input><button></button>',
  documentation: () => '<a></a>',
}))
vi.mock('../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ fixture: true }),
  sha256: () => 'fixture-hash',
}))
vi.mock('../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({}),
}))
vi.mock('node:module', () => ({
  createRequire: () => () => () => ({
    select: (selector: string, doc: Document) => {
      const nodes = Array.from(doc.querySelectorAll(selector))
      return state.mismatch === 'length'
        ? nodes.concat(doc.body)
        : state.mismatch === 'identity' && nodes.length
          ? nodes.map(() => doc.body)
          : nodes
    },
  }),
}))
vi.mock('../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: async (queries: Array<() => unknown>) => {
    queries.map(query => query())
    return [[1], [2]]
  },
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({ close: state.closes, version: () => 'fixture' }),
  },
}))
vi.mock('../../../../scripts/repo/bench/native/host.mts', () => ({
  nativeSources: async () => state.source,
  nativePage: async () => ({
    close: state.closes,
    context: () => ({
      newCDPSession: async () => ({
        send: async () => ({ profile: { samples: [] } }),
        detach: state.detach,
      }),
    }),
    evaluate: async (
      callback: (argument: unknown) => unknown,
      argument: unknown,
    ) => callback(argument),
  }),
}))
vi.mock('../../../../scripts/repo/bench/native/timing.mts', () => ({
  nativeTiming: async (
    _page: unknown,
    options: { selectors: Array<{ selector: string }> },
  ) => ({
    rows: options.selectors.map(({ selector }) => ({
      selector,
      errors: [state.error],
    })),
  }),
}))
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.write.mockClear()
  state.closes.mockClear()
  state.detach.mockClear()
  state.error = false
  state.mismatch = ''
  state.source = { competitor: '' }
  process.argv = [argv[0]!, 'close-comparisons.mts']
  let time = 0
  vi.stubGlobal('performance', {
    now: () => {
      time += 600
      return time
    },
  })
  vi.stubGlobal('window', {
    __createContext: () => ({ all: () => [], frame: { remove: vi.fn() } }),
  })
})
afterEach(() => {
  process.argv = argv
  vi.unstubAllGlobals()
})
async function run(...args: string[]) {
  process.argv.push(...args)
  await import('../../../../scripts/repo/bench/close-comparisons.mts')
}
test.each([
  { args: [] },
  { args: ['--baseline', '/fixture/baseline.js'] },
  { args: ['--profile'] },
])('records browser comparison %j', async ({ args }) => {
  await run(...args)
  const report = JSON.parse(state.write.mock.calls[0]![1])
  expect(report.rows).toHaveLength(6)
  expect(report.profiles).toHaveLength(args.includes('--profile') ? 6 : 0)
  expect(report.metadata.fixtures).toHaveLength(2)
  expect(state.closes).toHaveBeenCalledTimes(3)
  expect(state.detach).toHaveBeenCalledTimes(args.includes('--profile') ? 2 : 0)
})
test('cleans browser resources after invalid measured results', async () => {
  state.error = true
  await expect(run()).rejects.toBeInstanceOf(Error)
  expect(state.closes).toHaveBeenCalledTimes(2)
  expect(state.write).not.toHaveBeenCalled()
})
test('requires baseline for node comparison', async () => {
  await expect(run('--node')).rejects.toBeInstanceOf(Error)
})
test('records direct node controls with valid native identities', async () => {
  await run('--node', '--baseline', '/fixture/baseline.js')
  const report = JSON.parse(state.write.mock.calls[0]![1])
  expect(report.rows).toHaveLength(6)
  expect(
    report.rows.every(
      (row: { samples: number[][] }) => row.samples.length === 2,
    ),
  ).toBe(true)
})
test.each(['length', 'identity'])(
  'rejects incorrect node %s',
  async mismatch => {
    state.mismatch = mismatch
    await expect(
      run('--node', '--baseline', '/fixture/baseline.js'),
    ).rejects.toBeInstanceOf(Error)
    expect(state.write).not.toHaveBeenCalled()
  },
)
