import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  heap: 0,
  step: 1,
  factory: vi.fn(() => ({ select: vi.fn() })),
  consume: vi.fn(),
}))
vi.mock('../../../../dist/nwsapi.js', () => ({ default: state.factory }))
vi.mock('node:module', () => ({ createRequire: () => () => state.factory }))
vi.mock('mitata', () => ({ do_not_optimize: state.consume }))
vi.mock('jsdom', () => ({
  JSDOM: class {
    window = {
      document: {
        createElement: () => ({
          className: '',
          setAttribute: vi.fn(),
          appendChild: vi.fn(),
          remove: vi.fn(),
        }),
        body: { appendChild: vi.fn() },
      },
      DOMException,
    }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.heap = 0
  state.step = 1
  vi.stubGlobal('gc', vi.fn())
  vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({
    heapUsed: (state.heap += state.step),
    rss: 1,
    heapTotal: 1,
    external: 1,
    arrayBuffers: 1,
  }))
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw Object.assign(new Error('exit'), { code: 'ERR_TEST_EXIT' })
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/memory.bench.mts', ...args]
  try {
    await import('../../../../scripts/repo/bench/memory.bench.mts')
  } finally {
    process.argv = argv
  }
}
test('JSON memory reports retain live measurement subjects and finite medians', async () => {
  const log = vi.spyOn(console, 'log')
  await invoke([
    '--',
    '--count',
    '2',
    '--rounds',
    '2',
    '--compare',
    '/comparison.cjs',
    '--json',
  ])
  const report = JSON.parse(log.mock.calls[0]?.[0] as string)
  expect(report.count).toBe(2)
  expect(report.results).toHaveLength(2)
  expect(report.results[0]).toMatchObject({
    instance: 0.5,
    document: 0.5,
    engineOnly: 0,
    perCachedSelector: 0.5,
    retainedAfterRemoval: 1,
  })
  expect(state.consume).toHaveBeenCalled()
})
test.each([1, 4096, 3 * 1024 * 1024])(
  'human output formats retained bytes with step %s',
  async step => {
    state.step = step
    await invoke(['--count', '1', '--rounds', '1'])
    expect(state.factory).toHaveBeenCalled()
  },
)
test('default sample sizes and rounds support an unnamed comparison path', async () => {
  await invoke(['--compare', process.cwd(), '--json'])
  expect(state.factory).toHaveBeenCalled()
})
test.each([
  { args: ['--help'], success: true },
  { args: ['--count', '0'], success: false },
  { args: ['--count', 'NaN'], success: false },
  { args: ['--rounds', '0'], success: false },
  { args: ['--rounds', 'NaN'], success: false },
])('validates options %#', async ({ args, success }) => {
  if (success) {
    await invoke(args)
  } else {
    await expect(invoke(args)).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
  }
  expect(state.factory).not.toHaveBeenCalled()
})
test('missing exposed garbage collection rejects before measurement', async () => {
  vi.stubGlobal('gc', undefined)
  await expect(invoke([])).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
})
