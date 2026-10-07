import { afterEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  result: { status: 0, signal: null } as {
    status: number | null
    signal: NodeJS.Signals | null
  },
  setup: vi.fn(async () => '/tools'),
  run: vi.fn(),
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => true,
}))
vi.mock('../../../../scripts/repo/setup/tools.mts', () => ({
  setupTools: state.setup,
}))
vi.mock('../../../../scripts/repo/setup/manager.mts', () => ({
  setupNotice: () => 'configured',
  executeManaged: (args: string[]) => {
    state.run(args)
    return state.result
  },
}))

afterEach(() => vi.unstubAllGlobals())

async function invoke(status: number | null, signal: NodeJS.Signals | null) {
  vi.resetModules()
  state.setup.mockClear()
  state.run.mockClear()
  state.result = { status, signal }
  const kill = vi.fn()
  let exitCode: number | string | undefined
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        if (property === 'argv') {
          return ['node', 'bootstrap.mts']
        }
        return property === 'kill' ? kill : Reflect.get(target, property)
      },
      set(target, property, value) {
        if (property === 'exitCode') {
          exitCode = value
          return true
        }
        return Reflect.set(target, property, value)
      },
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../../../../scripts/repo/setup/bootstrap.mts')
  return { kill, exitCode }
}

test('the executable bootstrap preserves installation failures and missing statuses', async () => {
  expect((await invoke(7, null)).exitCode).toBe(7)
  expect(state.run).toHaveBeenCalledTimes(1)
  expect((await invoke(null, null)).exitCode).toBe(1)
})

test('the executable bootstrap completes preparation before reporting success', async () => {
  expect((await invoke(0, null)).exitCode).toBe(0)
  expect(state.setup).toHaveBeenCalledTimes(1)
  expect(state.run.mock.calls).toEqual([
    [['install', '--frozen-lockfile']],
    [['run', 'prepare']],
  ])
})

test('the executable bootstrap propagates an interrupted child signal', async () => {
  const result = await invoke(null, 'SIGINT')
  expect(result.kill).toHaveBeenCalledWith(process.pid, 'SIGINT')
  expect(result.exitCode).toBeUndefined()
  expect(state.run).toHaveBeenCalledTimes(1)
})
