import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { COMPILE_CACHE_DIR } from '../../../scripts/repo/lib/paths.mts'

const state = vi.hoisted(() => ({
  args: ['scripts/repo/check.mts'],
  foreign: false,
  exitCode: undefined as number | undefined,
  result: { status: 0, signal: null, error: undefined } as {
    status: number | null
    signal: NodeJS.Signals | null
    error: Error | undefined
  },
  spawn: vi.fn(),
  handoff: vi.fn(),
  kill: vi.fn(),
  exit: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawnSync: state.spawn }))
vi.mock('../../../scripts/repo/lib/package-manager.mts', () => ({
  invokedByForeignPackageManager: () => state.foreign,
}))
vi.mock('../../../scripts/repo/setup/manager.mts', () => ({
  handoff: state.handoff,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.args = ['scripts/repo/check.mts']
  state.foreign = false
  state.exitCode = undefined
  state.result = { status: 0, signal: null, error: undefined }
  state.spawn.mockImplementation(() => state.result)
  state.handoff.mockImplementation(async () => state.result)
  state.exit.mockImplementation((status: number) => {
    throw Object.assign(new Error('fixture'), {
      code: 'ERR_EXIT_FIXTURE',
      status,
    })
  })
  vi.stubEnv('NODE_COMPILE_CACHE', '')
  vi.stubEnv('NODE_DISABLE_COMPILE_CACHE', '')
  vi.stubEnv('NODE_V8_COVERAGE', '')
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        if (property === 'argv') {
          return ['node', 'run.mts', ...state.args]
        }
        if (property === 'exit') {
          return state.exit
        }
        if (property === 'kill') {
          return state.kill
        }
        return property === 'exitCode'
          ? state.exitCode
          : Reflect.get(target, property)
      },
      set(target, property, value) {
        if (property === 'exitCode') {
          state.exitCode = value
          return true
        }
        return Reflect.set(target, property, value)
      },
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('the runner forwards script arguments and preserves an existing compile cache', async () => {
  state.args.push('--check')
  await import('../../../scripts/repo/run.mts')
  expect(process.env['NODE_COMPILE_CACHE']).toBe(COMPILE_CACHE_DIR)
  expect(state.spawn).toHaveBeenCalledWith(
    process.execPath,
    [expect.any(String), '--check'],
    expect.objectContaining({ stdio: 'inherit' }),
  )
  expect(state.exitCode).toBe(0)
  vi.resetModules()
  vi.stubEnv('NODE_COMPILE_CACHE', '/fixture/existing-cache')
  await import('../../../scripts/repo/run.mts')
  expect(process.env['NODE_COMPILE_CACHE']).toBe('/fixture/existing-cache')
  expect(process.env['NODE_DISABLE_COMPILE_CACHE']).toBe('')
})

test('all coverage entry forms disable compile caching for descendant processes', async () => {
  const inputs = [
    ['scripts/repo/cover.mts'],
    ['scripts/repo/check.mts', '--coverage'],
    ['scripts/repo/check.mts', '--coverage.lines'],
    ['scripts/repo/check.mts', '--coverage=json'],
    ['scripts/repo/check.mts'],
  ]
  for (let i = 0, length = inputs.length; i < length; i += 1) {
    vi.resetModules()
    vi.stubEnv('NODE_DISABLE_COMPILE_CACHE', '')
    vi.stubEnv('NODE_V8_COVERAGE', i === 4 ? '/fixture/native-coverage' : '')
    state.args = inputs[i]!
    await import('../../../scripts/repo/run.mts')
    expect(process.env['NODE_DISABLE_COMPILE_CACHE']).toBe('1')
  }
})

test('foreign package manager calls are handed off instead of spawning the same manager', async () => {
  state.foreign = true
  state.result.status = 3
  await import('../../../scripts/repo/run.mts')
  expect(state.handoff).toHaveBeenCalledWith(expect.any(String), [])
  expect(state.spawn).not.toHaveBeenCalled()
  expect(state.exitCode).toBe(3)
})

test('child failure status, signals and startup errors keep their original execution meaning', async () => {
  state.result.status = null
  await import('../../../scripts/repo/run.mts')
  expect(state.exitCode).toBe(1)
  vi.resetModules()
  state.result.signal = 'SIGTERM'
  await import('../../../scripts/repo/run.mts')
  expect(state.kill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
  vi.resetModules()
  state.result.error = Object.assign(new Error('fixture'), {
    code: 'ERR_SPAWN_FIXTURE',
  })
  await expect(import('../../../scripts/repo/run.mts')).rejects.toMatchObject({
    code: 'ERR_SPAWN_FIXTURE',
  })
})

test('runner help exits successfully without starting a repository script', async () => {
  state.args = ['--help']
  await expect(import('../../../scripts/repo/run.mts')).rejects.toMatchObject({
    code: 'ERR_EXIT_FIXTURE',
    status: 0,
  })
  expect(state.spawn).not.toHaveBeenCalled()
})
