import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  run: vi.fn(),
  budget: vi.fn(),
  localUnit: vi.fn(),
  argv: [] as string[],
  exitCode: 0,
}))
vi.mock('../../../scripts/repo/review/unit.mts', () => ({
  runLocalUnitReview: state.localUnit,
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
  state.localUnit.mockReset()
  vi.spyOn(performance, 'now').mockReturnValue(0)
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
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('the default command runs the full local unit shard plan', async () => {
  await import('../../../scripts/repo/test.mts')
  expect(state.localUnit).toHaveBeenCalledOnce()
  expect(state.budget).not.toHaveBeenCalled()
  expect(state.run).not.toHaveBeenCalled()
})

test('the all command shards unit tests before its normal integration lane', async () => {
  state.argv.push('all')
  await import('../../../scripts/repo/test.mts')
  expect(state.localUnit).toHaveBeenCalledOnce()
  expect(state.budget).toHaveBeenCalledExactlyOnceWith('integration', false)
  expect(state.run).toHaveBeenCalledExactlyOnceWith(
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      '.config/repo/vitest.config.mts',
    ],
    1000,
    'integration',
    expect.objectContaining({ NWSAPI_TEST_TIER: 'integration' }),
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
  expect(state.localUnit).not.toHaveBeenCalled()
  expect(state.run.mock.calls.map(call => call[1])).toEqual([1000, 1000])
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
