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
    },
  )
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
  const result = launchTui(
    { command: 'node', version: 'v26.4.0' },
    '/pkg/bin/tui.mjs',
    '/pkg/bin/assets',
    {
      spawnChild: (() => child) as never,
      signalSource: new EventEmitter() as never,
    },
  )
  child.emit('error', new Error('spawn failed'))
  await expect(result).resolves.toBe(78)
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
    },
  )
  expect(() => signals.emit('SIGTERM')).not.toThrow()
  child.emit('close', 0, null)
  await expect(result).resolves.toBe(0)
})
