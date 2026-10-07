import { beforeEach, expect, test, vi, afterEach } from 'vitest'
const state = vi.hoisted(() => ({
  bench: vi.fn(),
  run: vi.fn(async () => {}),
  rm: vi.fn(),
  write: vi.fn(),
  factoryFail: false,
  select: vi.fn(),
  match: vi.fn(),
  replace: vi.fn((source: string, limit: number) => source + limit),
}))
vi.mock('node:fs', async original => ({
  ...(await original<object>()),
  mkdtempSync: () => '/fixture-cache',
  readFileSync: () => 'engine source',
  writeFileSync: state.write,
  rmSync: state.rm,
}))
vi.mock('node:module', () => ({
  createRequire: () => () => {
    if (state.factoryFail) {
      throw new Error('factory failed')
    }
    return () => ({ select: state.select, match: state.match })
  },
}))
vi.mock('mitata', () => ({
  bench: state.bench,
  run: state.run,
  do_not_optimize: vi.fn(),
  group: (_name: string, fn: () => void) => fn(),
  summary: (fn: () => void) => fn(),
}))
vi.mock('../../../../scripts/repo/bench/cache-source.mts', () => ({
  replaceCacheLimit: state.replace,
}))
vi.mock('jsdom', () => ({
  JSDOM: class {
    window = {
      document: {
        createElement: () => ({ classList: { add: vi.fn() }, id: '' }),
        body: { appendChild: vi.fn() },
      },
      DOMException,
    }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.factoryFail = false
  state.run.mockResolvedValue(undefined)
  state.bench.mockImplementation((_name: string, callback: () => void) =>
    callback(),
  )
  vi.stubGlobal('gc', vi.fn())
  vi.spyOn(process, 'memoryUsage').mockReturnValue({
    heapUsed: 1,
    rss: 1,
    heapTotal: 1,
    external: 1,
    arrayBuffers: 1,
  })
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw Object.assign(new Error('exit'), { code: 'ERR_TEST_EXIT' })
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/cache.bench.mts', ...args]
  try {
    await import('../../../../scripts/repo/bench/cache.bench.mts')
  } finally {
    process.argv = argv
  }
}
test('cache sweep warms all workloads, consumes callbacks and removes staged engines', async () => {
  await invoke(['--', '--limits', '2,3', '--nodes', '1'])
  expect(state.write).toHaveBeenCalledTimes(2)
  expect(state.bench).toHaveBeenCalledTimes(6)
  expect(state.match).toHaveBeenCalledTimes(20_060)
  expect(state.rm).toHaveBeenCalledOnce()
})
test('default limits and JSON output use machine readable results', async () => {
  await invoke(['--json', '--workload', 'small'])
  expect(state.replace.mock.calls.map(call => call[1])).toEqual([1000, 4096])
  expect(state.run).toHaveBeenCalledWith({ format: 'json' })
})
test.each([
  { args: ['--help'], success: true },
  { args: ['--limits', '0'], success: false },
  { args: ['--limits', 'NaN'], success: false },
  { args: ['--workload', 'unknown'], success: false },
])('CLI validation %#', async ({ args, success }) => {
  if (success) {
    await invoke(args)
  } else {
    await expect(invoke(args)).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
  }
  expect(state.bench).not.toHaveBeenCalled()
})
test('missing collection support rejects before benchmark registration', async () => {
  vi.stubGlobal('gc', undefined)
  await expect(invoke([])).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
})
test.each(['factory', 'run'])(
  'failed %s operation still removes staged engines',
  async mode => {
    state.factoryFail = mode === 'factory'
    if (mode === 'run') {
      state.run.mockRejectedValue(new Error('run failed'))
    }
    await expect(
      invoke(['--limits', '1', '--workload', 'small', '--nodes', '1']),
    ).rejects.toThrow()
    expect(state.rm).toHaveBeenCalled()
  },
)
