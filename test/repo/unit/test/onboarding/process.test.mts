import { EventEmitter } from 'node:events'
import type * as ChildProcess from 'node:child_process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const processMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof ChildProcess>()
  return {
    ...original,
    spawn: processMocks.spawn,
    spawnSync: processMocks.spawnSync,
  }
})

import { runBounded } from '../../../../../scripts/repo/test/onboarding/process.mts'

class FakeChild extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  pid = 7319
  killed: NodeJS.Signals[] = []

  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.killed.push(signal)
    return true
  }

  close(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emit('close', code, signal)
  }
}

let child: FakeChild
let restorePlatform = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  child = new FakeChild()
  processMocks.spawn.mockReset().mockImplementation(() => child)
  processMocks.spawnSync.mockReset().mockReturnValue({ status: 0 })
})

afterEach(() => {
  restorePlatform()
  restorePlatform = () => {}
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('success captures both streams and clears listeners and timers', async () => {
  const signals = captureSignals()
  const promise = runBounded('node', ['worker.mts'], '/checkout', {}, 1000)
  child.stdout.write('standard output')
  child.stderr.write('standard error')
  child.close(0)
  const result = await promise
  expect(result).toMatchObject({
    code: 0,
    signal: null,
    stdout: 'standard output',
    stderr: 'standard error',
    error: undefined,
  })
  expectRemovedSignals(signals)
  expect(vi.getTimerCount()).toBe(0)
})

test('spawn errors are returned and all resources are cleared', async () => {
  const signals = captureSignals()
  const expected = Object.assign(new Error('missing executable'), {
    code: 'ENOENT',
  })
  const promise = runBounded('missing', [], '/checkout', {}, 1000)
  child.emit('error', expected)
  const result = await promise
  expect(result.error).toBe(expected)
  expect(result.code).toBeNull()
  expectRemovedSignals(signals)
  expect(vi.getTimerCount()).toBe(0)
})

test('timeout kills the process group and escalates to SIGKILL', async () => {
  setPlatform('linux')
  const signals = captureSignals()
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const promise = runBounded('node', ['worker.mts'], '/checkout', {}, 250)
  await vi.advanceTimersByTimeAsync(250)
  expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(5000)
  expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL')
  child.close(0)
  const result = await promise
  expect(result.error?.message).toContain('Timed out after')
  expect(result.code).toBe(0)
  expectRemovedSignals(signals)
  expect(vi.getTimerCount()).toBe(0)
})

test('parent SIGTERM stays a cancellation even when the child exits zero', async () => {
  setPlatform('linux')
  const signals = captureSignals()
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const promise = runBounded('node', ['worker.mts'], '/checkout', {}, 1000)
  signals.get('SIGTERM')?.()
  expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
  child.close(0)
  const result = await promise
  expect(result.error?.message).toContain('Cancelled by SIGTERM')
  expect(result.code).toBe(0)
  expectRemovedSignals(signals)
  expect(vi.getTimerCount()).toBe(0)
})

test('Windows cancellation uses taskkill to stop the process tree', async () => {
  setPlatform('win32')
  const signals = captureSignals()
  const executable = 'C:\\runner temp\\entry-bin\\npm.cmd'
  const promise = runBounded(
    executable,
    ['--version'],
    'C:\\checkout',
    {},
    1000,
  )
  expect(processMocks.spawn).toHaveBeenCalledWith(
    process.env['ComSpec'] ?? 'cmd.exe',
    ['/d', '/s', '/c', `""${executable}" "--version""`],
    expect.objectContaining({
      detached: false,
      windowsVerbatimArguments: true,
      windowsHide: true,
    }),
  )
  signals.get('SIGTERM')?.()
  expect(processMocks.spawnSync.mock.calls[0]?.[0]).toContain('taskkill.exe')
  expect(processMocks.spawnSync.mock.calls[0]?.[1]).toEqual([
    '/PID',
    String(child.pid),
    '/T',
    '/F',
  ])
  expect(child.killed).toEqual([])
  child.close(0)
  const result = await promise
  expect(result.error?.message).toContain('Cancelled by SIGTERM')
  expectRemovedSignals(signals)
  expect(vi.getTimerCount()).toBe(0)
})

function captureSignals() {
  const handlers = new Map<string, () => void>()
  const originalOnce = process.once.bind(process)
  const once = vi.spyOn(process, 'once').mockImplementation(((
    event: string | symbol,
    listener: (...args: never[]) => void,
  ) => {
    if (event === 'SIGINT' || event === 'SIGTERM') {
      handlers.set(event, listener as () => void)
      return process
    }
    return Reflect.apply(originalOnce, process, [
      event,
      listener,
    ]) as typeof process
  }) as typeof process.once)
  const remove = vi.spyOn(process, 'removeListener')
  return { handlers, once, remove, get: (name: string) => handlers.get(name) }
}

function expectRemovedSignals(signals: ReturnType<typeof captureSignals>) {
  for (const event of ['SIGINT', 'SIGTERM']) {
    const handler = signals.handlers.get(event)
    expect(handler).toBeDefined()
    expect(signals.remove).toHaveBeenCalledWith(event, handler)
  }
  expect(signals.once).toHaveBeenCalledTimes(2)
}

function setPlatform(platform: NodeJS.Platform) {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { ...descriptor, value: platform })
  restorePlatform = () => Object.defineProperty(process, 'platform', descriptor)
}
