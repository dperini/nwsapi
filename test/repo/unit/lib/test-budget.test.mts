import { afterEach, expect, test, vi } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  COVERAGE_TEST_BUDGET_MS,
  TEST_BUDGET_MS,
  testBudget,
  runBudgeted,
} from '../../../../scripts/repo/lib/test-budget.mts'

const state = vi.hoisted(() => ({
  child: undefined as ChildProcess | undefined,
}))
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => state.child) }))
afterEach(() => vi.useRealTimers())

function childFixture(pid: number | undefined = 123) {
  const child = Object.assign(new EventEmitter(), { pid, kill: vi.fn() })
  state.child = child as unknown as ChildProcess
  const listeners = new Map<string, () => void>()
  vi.spyOn(process, 'on').mockImplementation((event, listener) => {
    listeners.set(String(event), listener as () => void)
    return process
  })
  const off = vi.spyOn(process, 'off').mockImplementation(() => process)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  return { child, listeners, kill, off }
}

test('coverage gets instrumentation headroom without changing normal lanes', () => {
  expect(testBudget('unit', false)).toBe(TEST_BUDGET_MS.unit)
  expect(testBudget('unit', true)).toBe(COVERAGE_TEST_BUDGET_MS.unit)
  expect(testBudget('integration', false)).toBe(TEST_BUDGET_MS.integration)
  expect(testBudget('integration', true)).toBe(
    COVERAGE_TEST_BUDGET_MS.integration,
  )
  expect(testBudget('upstream', true)).toBe(TEST_BUDGET_MS.upstream)
})

test('budgeted runners preserve exit codes, process environments and cleanup handlers', async () => {
  vi.useFakeTimers()
  const { child, listeners, kill, off } = childFixture()
  const env = { CUSTOM: 'value' }
  const running = runBudgeted(['script.mts'], 100, 'fixture', env)
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    ['script.mts'],
    expect.objectContaining({ env, detached: true }),
  )
  listeners.get('SIGINT')!()
  listeners.get('SIGTERM')!()
  expect(kill).toHaveBeenCalledWith(-123, 'SIGINT')
  expect(kill).toHaveBeenCalledWith(-123, 'SIGTERM')
  child.emit('exit', 0)
  await expect(running).resolves.toBe(0)
  expect(off).toHaveBeenCalledTimes(2)
  const another = runBudgeted([], 100, 'unknown exit')
  child.emit('exit', null)
  await expect(another).resolves.toBe(1)
})

test('budget expiration escalates termination and cannot become success after a late exit', async () => {
  vi.useFakeTimers()
  const { child, kill } = childFixture()
  const running = runBudgeted([], 100, 'expired')
  await vi.advanceTimersByTimeAsync(1100)
  expect(kill).toHaveBeenCalledWith(-123, 'SIGTERM')
  expect(kill).toHaveBeenCalledWith(-123, 'SIGKILL')
  child.emit('exit', 0)
  await expect(running).resolves.toBe(1)
})

test('startup errors reject with their original code and elapsed overrun remains a failure', async () => {
  vi.useFakeTimers()
  const { child } = childFixture()
  const running = runBudgeted([], 100, 'startup')
  const failure = Object.assign(new Error('Startup failure'), {
    code: 'ENOENT',
  })
  const rejected = expect(running).rejects.toMatchObject({ code: 'ENOENT' })
  child.emit('error', failure)
  await rejected
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  const late = runBudgeted([], 100, 'elapsed')
  clock.mockReturnValue(101)
  child.emit('exit', 0)
  await expect(late).resolves.toBe(1)
})

test('termination ignores exited processes and propagates unexpected kill failures', async () => {
  vi.useFakeTimers()
  const { child, listeners, kill } = childFixture()
  const running = runBudgeted([], 100, 'signals')
  kill.mockImplementationOnce(() => {
    throw Object.assign(new Error('Exited'), { code: 'ESRCH' })
  })
  expect(() => listeners.get('SIGTERM')!()).not.toThrow()
  const failures = [
    new Error('Unknown'),
    Object.assign(new Error('Denied'), { code: 'EPERM' }),
    'non-error',
  ]
  for (let i = 0, length = failures.length; i < length; i += 1) {
    kill.mockImplementationOnce(() => {
      throw failures[i]
    })
    expect(() => listeners.get('SIGTERM')!()).toThrow()
  }
  child.emit('exit', 0)
  await running
})

test('ungrouped runners use the child kill method on Windows', async () => {
  vi.useFakeTimers()
  const { child, listeners } = childFixture()
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: 'win32' })
  try {
    const running = runBudgeted([], 100, 'windows')
    listeners.get('SIGTERM')!()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('exit', 0)
    await running
  } finally {
    Object.defineProperty(process, 'platform', descriptor)
  }
})
