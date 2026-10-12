import { expect, test, vi } from 'vitest'
import {
  controlVoiceOver,
  voiceOverState,
} from '../../../../../scripts/repo/develop/voiceover/control.mts'

test('state checks only the current user and treats pgrep errors as unknown', () => {
  const run = vi.fn(() => ({ status: 0 }))
  expect(voiceOverState(run, 'darwin', 501)).toBe('running')
  expect(run).toHaveBeenCalledWith('/usr/bin/pgrep', [
    '-U',
    '501',
    '-x',
    'VoiceOver',
  ])
  expect(voiceOverState(() => ({ status: 1 }), 'darwin', 501)).toBe('stopped')
  expect(voiceOverState(() => ({ status: 2 }), 'darwin', 501)).toBe('unknown')
  expect(voiceOverState(() => ({ status: null }), 'darwin', 501)).toBe(
    'unknown',
  )
})

test('start and stop run only the selected action and verify resulting state', async () => {
  const start = vi.fn((command: string) => ({
    status: command === '/usr/bin/pgrep' ? 0 : 0,
  }))
  const started = await controlVoiceOver(
    'start',
    'stopped',
    start,
    'darwin',
    async () => {},
    501,
  )
  expect(started.status).toBe(0)
  expect(start).toHaveBeenCalledWith('/usr/bin/open', [
    '-a',
    '/System/Library/CoreServices/VoiceOver.app',
  ])

  let isRunning = true
  const stop = vi.fn((command: string, _args: string[]) => ({
    status: command === '/usr/bin/pgrep' ? (isRunning ? 0 : 1) : 0,
  }))
  const stopped = await controlVoiceOver(
    'stop',
    'running',
    (command, args) => {
      if (command === '/usr/bin/osascript') {
        isRunning = false
        expect(args[1]).toContain('if application "VoiceOver" is running')
      }
      return stop(command, args)
    },
    'darwin',
    async () => {},
    501,
  )
  expect(stopped.status).toBe(0)
  expect(stop).toHaveBeenCalledWith('/usr/bin/osascript', [
    '-e',
    'if application "VoiceOver" is running then tell application "VoiceOver" to quit',
  ])
})

test('already matching or uncertain state causes no command', async () => {
  const run = vi.fn(() => ({ status: 0 }))
  expect(
    (
      await controlVoiceOver(
        'start',
        'running',
        run,
        'darwin',
        async () => {},
        501,
      )
    ).status,
  ).toBe(0)
  expect(
    (
      await controlVoiceOver(
        'stop',
        'stopped',
        run,
        'darwin',
        async () => {},
        501,
      )
    ).status,
  ).toBe(0)
  expect(
    (
      await controlVoiceOver(
        'start',
        'unknown',
        run,
        'darwin',
        async () => {},
        501,
      )
    ).status,
  ).toBe(1)
  expect(run).not.toHaveBeenCalled()
})

test('unsupported platforms and failed start do not use a state toggle', async () => {
  const run = vi.fn(() => ({ status: 0 }))
  expect(
    (await controlVoiceOver('start', 'stopped', run, 'linux')).status,
  ).toBe(1)
  const failed = await controlVoiceOver(
    'start',
    'stopped',
    () => ({ status: 1 }),
    'darwin',
    async () => {},
    501,
  )
  expect(failed.status).toBe(1)
  expect(run).not.toHaveBeenCalled()
})

test('a start command without state confirmation is reported as uncertain', async () => {
  const run = vi.fn((command: string) => ({
    status: command === '/usr/bin/open' ? 0 : 1,
  }))
  let time = 0
  const delay = vi.fn(async (milliseconds: number) => {
    time += milliseconds
  })
  const now = vi.fn(() => time)
  const result = await controlVoiceOver(
    'start',
    'stopped',
    run,
    'darwin',
    delay,
    501,
    now,
  )
  expect(result.status).toBe(1)
  expect(result.message).toContain('did not confirm the running state')
  expect(delay).toHaveBeenCalled()
  expect(now).toHaveBeenCalled()
})

test('an unavailable UID leaves process state unknown without probing', () => {
  const run = vi.fn(() => ({ status: 0 }))
  expect(voiceOverState(run, 'darwin', null)).toBe('unknown')
  expect(run).not.toHaveBeenCalled()
})
