import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  node: { id: 'first' },
  other: { id: 'other' },
  bench: vi.fn(),
  run: vi.fn(async () => {}),
  primary: vi.fn(),
  comparison: vi.fn(),
  qsa: vi.fn(),
}))
vi.mock('node:fs', () => ({ readFileSync: () => '<html></html>' }))
vi.mock('node:module', () => ({
  createRequire: () => () => () => ({ select: state.comparison }),
}))
vi.mock('../../../../dist/nwsapi.js', () => ({
  default: () => ({ select: state.primary }),
}))
vi.mock('../../../../scripts/repo/bench/presets.mts', () => ({
  default: {
    fixture: [
      '.good',
      '.both',
      '.nw-error',
      '.qsa-error',
      '.different',
      '.compare-mismatch',
      '.compare-error',
    ],
    second: ['.good2'],
  },
}))
vi.mock('mitata', () => ({
  bench: state.bench,
  run: state.run,
  do_not_optimize: vi.fn(),
  group: (_name: string, callback: () => void) => callback(),
  summary: (callback: () => void) => callback(),
}))
vi.mock('jsdom', () => ({
  JSDOM: class {
    window = { document: { querySelectorAll: state.qsa }, DOMException }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.bench.mockImplementation((_name: string, callback: () => void) =>
    callback(),
  )
  state.primary.mockImplementation((selector: string) => {
    if (selector === '.both') {
      throw 'primary failed'
    }
    if (selector === '.nw-error') {
      throw new Error('primary failed')
    }
    return selector === '.different' ? [state.other] : [state.node]
  })
  state.qsa.mockImplementation((selector: string) => {
    if (selector === '.both') {
      throw new Error('reference failed')
    }
    if (selector === '.qsa-error') {
      throw 'reference failed'
    }
    return [state.node]
  })
  state.comparison.mockImplementation((selector: string) => {
    if (selector === '.compare-error') {
      throw new Error('comparison failed')
    }
    return selector === '.compare-mismatch' ? [state.other] : [state.node]
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw Object.assign(new Error('exit'), { code: 'ERR_TEST_EXIT' })
  })
})
afterEach(() => {
  vi.doUnmock('node:util')
  vi.unstubAllGlobals()
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/selectors.bench.mts', ...args]
  try {
    await import('../../../../scripts/repo/bench/selectors.bench.mts')
  } finally {
    process.argv = argv
  }
}
test('preflight skips errors and disagreements and runs only valid timings', async () => {
  await invoke([])
  expect(state.bench).toHaveBeenCalledTimes(8)
  expect(state.run).toHaveBeenCalledWith({})
})
test('comparison preflight and JSON output preserve structured correctness issues', async () => {
  const write = vi.spyOn(process.stderr, 'write')
  await invoke(['--', '--compare', '/comparison.cjs', '--json'])
  expect(state.bench).toHaveBeenCalledTimes(6)
  const report = JSON.parse(write.mock.calls[0]?.[0] as string)
  expect(report.issues).toHaveLength(6)
  expect(state.run).toHaveBeenCalledWith({ format: 'json' })
})
test.each([
  { args: ['--selector', 'good'] },
  { args: ['--selector', '/good/i'] },
  { args: ['--preset', 'fixture, fixture', '--selector', '.good'] },
])('selector filters %# retain only requested timings', async ({ args }) => {
  await invoke(args)
  expect(state.bench).toHaveBeenCalled()
})
test.each([{ args: ['--help'] }, { args: ['--list'] }])(
  'informational invocation %# avoids engines',
  async ({ args }) => {
    await invoke(args)
    expect(state.primary).not.toHaveBeenCalled()
  },
)
test.each([
  { args: ['--unknown'] },
  { args: ['--preset', 'unknown'] },
  { args: ['--selector', '/(bad/i'] },
  { args: ['--selector', 'missing'] },
])('invalid invocation %# fails', async ({ args }) => {
  await expect(invoke(args)).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
})
test('non-Error parser and matcher failures still produce a failing status', async () => {
  vi.doMock('node:util', () => ({
    parseArgs: () => {
      throw 'parse failed'
    },
  }))
  await expect(invoke([])).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
  vi.doUnmock('node:util')
  vi.resetModules()
  const NativeRegExp = RegExp
  vi.stubGlobal(
    'RegExp',
    class extends NativeRegExp {
      constructor(pattern: string | RegExp, flags?: string | undefined) {
        if (pattern === 'good') {
          throw 'regex failed'
        }
        super(pattern, flags)
      }
    },
  )
  await expect(invoke(['--selector', '/good/i'])).rejects.toMatchObject({
    code: 'ERR_TEST_EXIT',
  })
})
