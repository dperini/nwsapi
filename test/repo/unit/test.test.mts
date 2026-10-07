import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  run: vi.fn(),
  budget: vi.fn(),
  argv: [] as string[],
  exitCode: 0,
}))
vi.mock('../../../scripts/repo/lib/test-budget.mts', () => ({
  runBudgeted: state.run,
  testBudget: state.budget,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.argv = ['node', 'test.mts']
  state.exitCode = 0
  state.run.mockResolvedValue(0)
  state.budget.mockReturnValue(1000)
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, key) {
        if (key === 'argv') {
          return state.argv
        }
        if (key === 'exitCode') {
          return state.exitCode
        }
        return Reflect.get(target, key)
      },
      set(target, key, value) {
        if (key === 'exitCode') {
          state.exitCode = value
          return true
        }
        return Reflect.set(target, key, value)
      },
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

test('default test command runs only offline unit tests with its budget', async () => {
  await import('../../../scripts/repo/test.mts')
  expect(state.budget).toHaveBeenCalledExactlyOnceWith('unit', false)
  expect(state.run).toHaveBeenCalledExactlyOnceWith(
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      '.config/repo/vitest.config.mts',
    ],
    1000,
    'unit',
    expect.objectContaining({ NWSAPI_TEST_TIER: 'unit' }),
  )
})

test('all coverage runs isolate tier reports and forward runner options', async () => {
  state.argv.push('all', '--coverage', '--reporter=dot')
  await import('../../../scripts/repo/test.mts')
  expect(state.run.mock.calls.map(call => call[2])).toEqual([
    'unit',
    'integration',
  ])
  expect(state.run.mock.calls.map(call => call[0].at(-1))).toEqual([
    '--coverage.reportsDirectory=coverage/unit',
    '--coverage.reportsDirectory=coverage/integration',
  ])
  expect(state.run.mock.calls[0]![0]).toContain('--reporter=dot')
})

test('upstream selects Playwright and does not add Vitest coverage flags', async () => {
  state.argv.push('upstream', '--coverage')
  await import('../../../scripts/repo/test.mts')
  expect(state.run.mock.calls[0]![0]).toEqual([
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    '.config/playwright.config.mts',
    '--coverage',
  ])
})

test('a failed tier sets the exit status and stops following tiers', async () => {
  state.argv.push('all')
  state.run.mockResolvedValue(7)
  await import('../../../scripts/repo/test.mts')
  expect(state.exitCode).toBe(7)
  expect(state.run).toHaveBeenCalledOnce()
})

test('unsupported tiers fail before starting a runner', async () => {
  state.argv.push('unknown')
  await expect(import('../../../scripts/repo/test.mts')).rejects.toBeInstanceOf(
    Error,
  )
  expect(state.run).not.toHaveBeenCalled()
})

test.each(['--help', '-h'])(
  'help %s exits without starting tests',
  async flag => {
    state.argv.push(flag)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw Object.assign(new Error('exit fixture'), { code: 'ERR_TEST_EXIT' })
    })
    await expect(
      import('../../../scripts/repo/test.mts'),
    ).rejects.toMatchObject({ code: 'ERR_TEST_EXIT' })
    expect(exit).toHaveBeenCalledWith(0)
    expect(state.run).not.toHaveBeenCalled()
  },
)
