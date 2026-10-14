import { EventEmitter } from 'node:events'
import { expect, test, vi } from 'vitest'
import {
  canStartTui,
  launchTui,
  selectTuiRuntime,
} from '../../../../../scripts/repo/cli/ui/launcher.mts'
import type { TuiRuntime } from '../../../../../scripts/repo/cli/ui/launcher.mts'

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    inputIsTTY: true,
    outputIsTTY: true,
    columns: 100,
    rows: 30,
    platform: 'linux',
    arch: 'x64',
    libc: 'glibc',
    env: {},
    assetAvailable: true,
    ...overrides,
  }
}

test('TUI preflight rejects plain, small, JSON, unsupported and missing-asset cases', () => {
  expect(canStartTui(preflight())).toBe(true)
  for (const overrides of [
    { inputIsTTY: false },
    { outputIsTTY: false },
    { columns: 79 },
    { rows: 23 },
    { env: { NO_COLOR: '' } },
    { env: { TERM: 'dumb' } },
    { json: true },
    { platform: 'aix' },
    { arch: 'ia32' },
    { platform: 'linux', libc: undefined },
    { assetAvailable: false },
  ]) {
    expect(canStartTui(preflight(overrides))).toBe(false)
  }
})

test('runtime selection prefers compatible current Node and uses only explicit fallback', () => {
  const results = new Map<string, TuiRuntime | undefined>([
    ['current', undefined],
    ['existing', { command: 'existing', version: 'v26.4.0' }],
  ])
  const probe = (command: string) => results.get(command)
  expect(selectTuiRuntime('current', undefined, probe)).toBeUndefined()
  expect(selectTuiRuntime('current', 'existing', probe)).toEqual({
    command: 'existing',
    version: 'v26.4.0',
  })
  expect(selectTuiRuntime('current', 'current', probe)).toBeUndefined()
})

test('launch forwards runtime args and terminal signals, then maps signal exit codes', async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    pid: number
    kill: (signal: NodeJS.Signals) => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.pid = 123
  child.kill = vi.fn(() => true)
  const signals = new EventEmitter()
  const spawnChild = vi.fn(() => child)
  const killProcess = vi.fn()
  const cleanupCache = vi.fn(async () => {})
  const result = launchTui(
    { command: '/existing/node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: spawnChild as never,
      signalSource: signals as never,
      platform: 'linux',
      killProcess: killProcess as never,
      env: { CUSTOM: 'yes' },
      cwd: '/project',
      prepareCache: async () => ({
        env: { TMPDIR: '/tmp/private' },
        cleanup: cleanupCache,
      }),
    },
  )
  await vi.waitFor(() => expect(spawnChild).toHaveBeenCalled())
  expect(spawnChild).toHaveBeenCalledWith(
    '/existing/node',
    [
      ...process.execArgv.filter(
        argument =>
          argument !== '--experimental-ffi' &&
          !argument.startsWith('--inspect') &&
          !argument.startsWith('--debug'),
      ),
      '--experimental-ffi',
      '/pkg/bin/tui.mjs',
    ],
    expect.objectContaining({
      cwd: '/project',
      detached: true,
      env: expect.objectContaining({
        CUSTOM: 'yes',
        TMPDIR: '/tmp/private',
        OTUI_ASSET_ROOT: '/pkg/bin/assets',
      }),
      stdio: 'inherit',
    }),
  )
  signals.emit('SIGTERM')
  expect(killProcess).toHaveBeenCalledTimes(1)
  expect(killProcess).toHaveBeenCalledWith(-123, 'SIGTERM')
  child.emit('close', null, 'SIGTERM')
  await expect(result).resolves.toBe(143)
  expect(cleanupCache).toHaveBeenCalledTimes(1)
  expect(signals.listenerCount('SIGINT')).toBe(0)
  expect(signals.listenerCount('SIGTERM')).toBe(0)
})

test('launch reports startup errors without retrying the selected action', async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill: () => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(() => true)
  const cleanupCache = vi.fn(async () => {
    throw new Error('cleanup failed')
  })
  const warn = vi.fn()
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => child) as never,
      signalSource: new EventEmitter() as never,
      prepareCache: async () => ({ env: {}, cleanup: cleanupCache }),
      warn,
    },
  )
  await vi.waitFor(() =>
    expect(child.listenerCount('error')).toBeGreaterThan(0),
  )
  child.emit('error', new Error('spawn failed'))
  await expect(result).resolves.toBe(78)
  expect(cleanupCache).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith('Could not remove temporary OpenTUI files.')
})

test('launch preserves the SIGINT exit code and cleans its cache', async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill: () => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(() => true)
  const cleanup = vi.fn(async () => {})
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => child) as never,
      prepareCache: async () => ({ env: {}, cleanup }),
    },
  )
  await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1))
  child.emit('close', null, 'SIGINT')
  await expect(result).resolves.toBe(130)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

test('a post-start child error waits for close before cleaning its cache', async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill: () => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(() => true)
  const cleanup = vi.fn(async () => {})
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => child) as never,
      prepareCache: async () => ({ env: {}, cleanup }),
    },
  )
  await vi.waitFor(() => expect(child.listenerCount('spawn')).toBe(1))
  child.emit('spawn')
  child.emit('error', new Error('later process operation failed'))
  expect(cleanup).not.toHaveBeenCalled()
  expect(child.listenerCount('error')).toBe(1)
  expect(() =>
    child.emit('error', new Error('another process operation failed')),
  ).not.toThrow()
  expect(cleanup).not.toHaveBeenCalled()
  child.emit('close', null, 'SIGTERM')
  await expect(result).resolves.toBe(143)
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(child.listenerCount('error')).toBe(0)
  expect(child.listenerCount('spawn')).toBe(0)
})

test.each([
  { code: 0, signal: null, expected: 0 },
  { code: null, signal: 'SIGINT' as const, expected: 130 },
  { code: null, signal: 'SIGTERM' as const, expected: 143 },
])('cache cleanup failure preserves child exit $expected', async outcome => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill: () => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(() => true)
  const warn = vi.fn()
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => child) as never,
      prepareCache: async () => ({
        env: {},
        cleanup: async () => {
          throw new Error('cleanup failed')
        },
      }),
      warn,
    },
  )
  await vi.waitFor(() => expect(child.listenerCount('close')).toBe(1))
  child.emit('close', outcome.code, outcome.signal)
  await expect(result).resolves.toBe(outcome.expected)
  expect(warn).toHaveBeenCalledWith('Could not remove temporary OpenTUI files.')
})

test('a signal race with an exited child does not interrupt close handling', async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    pid: number
    kill: (signal: NodeJS.Signals) => boolean
  }
  child.exitCode = null
  child.signalCode = null
  child.pid = 123
  child.kill = vi.fn(() => true)
  const signals = new EventEmitter()
  const killProcess = vi.fn(() => {
    throw Object.assign(new Error('process no longer exists'), {
      code: 'ESRCH',
    })
  })
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => child) as never,
      signalSource: signals as never,
      platform: 'linux',
      killProcess: killProcess as never,
      prepareCache: async () => ({ env: {}, cleanup: async () => {} }),
    },
  )
  await vi.waitFor(() => expect(signals.listenerCount('SIGTERM')).toBe(1))
  expect(() => signals.emit('SIGTERM')).not.toThrow()
  child.emit('close', 0, null)
  await expect(result).resolves.toBe(0)
})

test('launch cleans a prepared cache when spawning fails', async () => {
  const cleanup = vi.fn(async () => {})
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => {
        throw new Error('spawn failed')
      }) as never,
      prepareCache: async () => ({ env: { TEMP: '/tmp/private' }, cleanup }),
    },
  )
  await expect(result).resolves.toBe(78)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

test('cache preparation failure selects the plain-menu fallback', async () => {
  const spawnChild = vi.fn()
  const result = await launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: spawnChild as never,
      prepareCache: async () => {
        throw new Error('temporary storage unavailable')
      },
    },
  )
  expect(result).toBe(78)
  expect(spawnChild).not.toHaveBeenCalled()
})
