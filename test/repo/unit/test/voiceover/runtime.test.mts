import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, test, vi } from 'vitest'
import { createRuntime } from '../../../../../scripts/repo/test/voiceover/runtime.mts'
import type { PreferenceSnapshot } from '../../../../../scripts/repo/test/voiceover/snapshot.mts'

const commands = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(() => {
    throw new Error('Mock host commands in unit tests.')
  }),
  execFileSync: vi.fn(() => {
    throw new Error('Mock host commands in unit tests.')
  }),
}))
vi.mock('node:child_process', () => commands)

afterEach(() => {
  expect(commands.spawnSync).not.toHaveBeenCalled()
  expect(commands.execFileSync).not.toHaveBeenCalled()
  vi.useRealTimers()
})

test('broken worker input is handled through mocked termination and close', async () => {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
    pid: 424_242,
    kill: vi.fn(),
  })
  commands.spawn.mockReturnValue(child)
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const runtime = createRuntime()
  const handle = runtime.startWorker(
    {} as PreferenceSnapshot,
    'http://127.0.0.1:4389/model-guide-reading.html?doc=docs/repo/selector/api.md',
    vi.fn(),
    vi.fn(),
    async () => true,
  )
  expect(() =>
    child.stdin.emit('error', new Error('fixture EPIPE')),
  ).not.toThrow()
  expect(
    kill.mock.calls.some(([, signal]) => signal === 'SIGTERM') ||
      child.kill.mock.calls.some(([signal]) => signal === 'SIGTERM'),
  ).toBe(true)
  child.emit('close', 1, null)
  expect(await handle.wait()).toMatchObject({
    status: 1,
    error: 'The narration worker input closed unexpectedly.',
  })
  await vi.advanceTimersByTimeAsync(2000)
  expect(kill.mock.calls.some(([, signal]) => signal === 'SIGKILL')).toBe(false)
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
})
