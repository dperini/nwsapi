import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fuzzInvocation } from '../../../scripts/repo/fuzz.mts'

const state = vi.hoisted(() => ({
  main: false,
  args: [] as string[],
  exitCode: undefined as number | undefined,
  result: { status: 0, error: undefined } as {
    status: number | null
    error: Error | undefined
  },
  spawn: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawnSync: state.spawn }))
vi.mock('../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/scripts/repo/fuzz.mts'),
}))
beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.args = []
  state.exitCode = undefined
  state.result = { status: 0, error: undefined }
  state.spawn.mockImplementation(() => state.result)
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        if (property === 'argv') {
          return ['node', 'fuzz.mts', ...state.args]
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
afterEach(() => vi.unstubAllGlobals())

test('replay removes supervisor state without changing unrelated child environment settings', () => {
  const replay = fuzzInvocation(['--replay', 'fixture'], {
    CUSTOM_SETTING: 'fixture',
    VITIATE_OPTIMIZE: '1',
    VITIATE_CLI_IPC: '1',
    VITIATE_SUPERVISOR: '1',
    VITIATE_SHMEM: '1',
  })
  expect(replay).toEqual({
    args: ['node_modules/vitest/vitest.mjs', 'run', 'fixture'],
    env: { CUSTOM_SETTING: 'fixture', VITIATE_FUZZ: '0' },
  })
  expect(fuzzInvocation(['fixture']).env['VITIATE_FUZZ']).toBe('1')
})

test('the fuzz command handles help and propagates normal and missing child exit status', async () => {
  state.main = true
  const inputs = [['--help'], ['fixture'], ['--replay', 'fixture']]
  for (let i = 0, length = inputs.length; i < length; i += 1) {
    vi.resetModules()
    state.args = inputs[i]!
    state.result.status = i === 2 ? null : 3
    await import('../../../scripts/repo/fuzz.mts')
  }
  expect(state.spawn).toHaveBeenCalledTimes(2)
  expect(state.spawn.mock.calls.map(call => call[2].env.VITIATE_FUZZ)).toEqual([
    '1',
    '0',
  ])
  expect(state.exitCode).toBe(1)
})

test('a fuzz subprocess startup failure keeps its original error code', async () => {
  state.main = true
  state.result.error = Object.assign(new Error('fixture'), {
    code: 'ERR_FUZZ_FIXTURE',
  })
  vi.resetModules()
  await expect(import('../../../scripts/repo/fuzz.mts')).rejects.toMatchObject({
    code: 'ERR_FUZZ_FIXTURE',
  })
})
