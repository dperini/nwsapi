import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { expect, test, vi } from 'vitest'
import {
  PlainSetupProtocol,
  runPlainSetup,
} from '../../../../../scripts/repo/test/onboarding/terminal.mts'
import type { SpawnTerminal } from '../../../../../scripts/repo/test/onboarding/terminal.mts'

class FakeTerminal extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  pid = 31_415
  answers: string[] = []
  wasConfirmed = false
  killed: NodeJS.Signals[] = []

  constructor() {
    super()
    this.stdin.setEncoding('utf8')
    this.stdin.on('data', data => this.answer(String(data)))
  }

  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.killed.push(signal)
    this.close(null, signal)
    return true
  }

  answer(value: string) {
    this.answers.push(value)
    if (value === '1\n') {
      this.stdout.write(
        '\u001B[36mSet up this checkout\u001B[0m\nCommand: pnpm run setup\nEnter to run, ',
      )
      this.stdout.write('b to go back, or q to quit:')
      return
    }
    if (value === '\n') {
      this.wasConfirmed = true
      this.stdout.write(
        'Done. Next: open the documentation and choose a change.\nEnter to return to the menu, or q to quit:',
      )
      return
    }
    if (value === 'q\n') {
      this.close(0, null)
    }
  }

  close(code: number | null, signal: NodeJS.Signals | null) {
    this.stdout.end()
    this.stderr.end()
    setImmediate(() => this.emit('close', code, signal))
  }
}

function mockedSpawn(child: FakeTerminal, onSpawn?: (args: string[]) => void) {
  return ((command, args) => {
    onSpawn?.([command, ...args])
    setImmediate(() => child.stdout.write('Preview a task:'))
    return child as unknown as ChildProcessWithoutNullStreams
  }) as SpawnTerminal
}

function fakeKill(child: FakeTerminal): typeof process.kill {
  return ((pid: number, signal?: NodeJS.Signals | number | string) => {
    if (pid === -child.pid) {
      child.kill(
        typeof signal === 'string' ? (signal as NodeJS.Signals) : 'SIGTERM',
      )
    }
    return true
  }) as typeof process.kill
}

function options(child: FakeTerminal, overrides: Record<string, unknown> = {}) {
  return {
    checkout: '/checkout',
    node: '/pinned/node',
    env: { PATH: '/system/bin' },
    timeoutMs: 1000,
    platform: 'linux' as NodeJS.Platform,
    spawnProcess: mockedSpawn(child),
    exists: () => false,
    killProcess: vi.fn(fakeKill(child)),
    ...overrides,
  }
}

test('plain setup previews, waits for confirmation, completes, and returns to menu', async () => {
  const child = new FakeTerminal()
  let stateCreated = false
  const exists = vi.fn(() => stateCreated)
  const killProcess = vi.fn(fakeKill(child))
  const spawnProcess = ((command, args, request) => {
    expect(command).toBe('script')
    expect(args.slice(0, 3)).toEqual(['-q', '-e', '-c'])
    expect(args[3]).toContain("'/pinned/node'")
    expect(request.cwd).toBe('/checkout')
    setImmediate(() => child.stdout.write('Preview a task:'))
    return child as unknown as ChildProcessWithoutNullStreams
  }) as SpawnTerminal
  child.stdin.on('data', data => {
    if (String(data) === '\n') {
      stateCreated = true
    }
  })
  const result = await runPlainSetup({
    ...options(child),
    exists,
    spawnProcess,
    killProcess,
  })
  expect(result).toMatchObject({
    code: 0,
    signal: null,
    previewObserved: true,
    confirmationSent: true,
    setupCompleted: true,
  })
  expect(result.stdout).toContain('Command: pnpm run setup')
  expect(child.answers).toEqual(['1\n', '\n', 'q\n'])
  expect(child.wasConfirmed).toBe(true)
  expect(exists).toHaveBeenCalledTimes(8)
  expect(killProcess).not.toHaveBeenCalled()
})

test('protocol handles partial prompts and ignores confirmation in the wrong phase', () => {
  const protocol = new PlainSetupProtocol()
  expect(
    protocol.accept('Enter to run, b to go back, or q to quit:'),
  ).toBeUndefined()
  expect(protocol.confirmationSent).toBe(false)
  expect(protocol.accept('Preview a task:')).toBe('select-setup')
  expect(
    protocol.accept('\u001B[32mSet up this checkout\u001B[0m\nCommand: '),
  ).toBeUndefined()
  expect(
    protocol.accept(
      'node scripts/repo/setup/bootstrap.mts\nEnter to run, b to go back, or q to quit:',
    ),
  ).toBe('confirm-setup')
  expect(protocol.previewObserved).toBe(true)
  expect(protocol.confirmationSent).toBe(false)
})

test('an incomplete preview fails closed without confirming setup', async () => {
  const child = new FakeTerminal()
  const exists = vi.fn(() => false)
  child.stdin.removeAllListeners('data')
  child.stdin.on('data', data => {
    child.answers.push(String(data))
  })
  const spawnProcess = (() => {
    setImmediate(() => {
      child.stdin.once('data', () => {
        child.stdout.write('Enter to run, b to go back, or q to quit:')
      })
      child.stdout.write('Preview a task:')
    })
    return child as unknown as ChildProcessWithoutNullStreams
  }) as SpawnTerminal
  const result = await runPlainSetup({
    ...options(child),
    spawnProcess,
    exists,
    killProcess: vi.fn(fakeKill(child)),
  })
  expect(result.failure).toContain('preview was incomplete')
  expect(result.previewObserved).toBe(false)
  expect(result.confirmationSent).toBe(false)
  expect(child.wasConfirmed).toBe(false)
  expect(child.answers).toEqual(['1\n'])
})

test('a newly created setup directory before confirmation stops the journey', async () => {
  const child = new FakeTerminal()
  let created = false
  const exists = vi.fn(() => created)
  const spawnProcess = (() => {
    setImmediate(() => {
      created = true
      child.stdout.write('Preview a task:')
    })
    return child as unknown as ChildProcessWithoutNullStreams
  }) as SpawnTerminal
  const result = await runPlainSetup({
    ...options(child),
    exists,
    spawnProcess,
    killProcess: vi.fn(fakeKill(child)),
  })
  expect(result.failure).toContain('created node_modules before confirmation')
  expect(result.confirmationSent).toBe(false)
  expect(child.answers).toEqual([])
})

test('cancellation terminates the PTY process group without confirming setup', async () => {
  const child = new FakeTerminal()
  const controller = new AbortController()
  const killProcess = vi.fn(fakeKill(child))
  const resultPromise = runPlainSetup({
    ...options(child),
    signal: controller.signal,
    killProcess,
  })
  controller.abort()
  const result = await resultPromise
  expect(result.failure).toContain('cancelled')
  expect(result.confirmationSent).toBe(false)
  expect(killProcess).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
  expect(child.killed).toContain('SIGTERM')
})

test('the timeout terminates a stalled PTY journey before setup confirmation', async () => {
  const child = new FakeTerminal()
  const killProcess = vi.fn(fakeKill(child))
  const result = await runPlainSetup({
    ...options(child),
    timeoutMs: 5,
    spawnProcess: (() =>
      child as unknown as ChildProcessWithoutNullStreams) as SpawnTerminal,
    killProcess,
  })
  expect(result.failure).toContain('timed out after 5ms')
  expect(result.confirmationSent).toBe(false)
  expect(killProcess).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
  expect(child.killed).toContain('SIGTERM')
})

test('macOS uses the BSD script command form with argument boundaries intact', async () => {
  const child = new FakeTerminal()
  const calls: string[][] = []
  const result = await runPlainSetup({
    ...options(child),
    platform: 'darwin',
    spawnProcess: mockedSpawn(child, args => calls.push(args)),
  })
  expect(calls).toEqual([
    [
      'script',
      '-q',
      '/dev/null',
      '/pinned/node',
      '/checkout/scripts/repo/develop/run.mts',
      '--plain',
    ],
  ])
  expect(result.setupCompleted).toBe(true)
})

test('unsupported Windows terminals fail without spawning a substitute UI', async () => {
  const spawnProcess = vi.fn()
  await expect(
    runPlainSetup({
      ...options(new FakeTerminal()),
      platform: 'win32',
      spawnProcess: spawnProcess as unknown as SpawnTerminal,
    }),
  ).rejects.toThrow('not supported on Windows')
  expect(spawnProcess).not.toHaveBeenCalled()
})

test('VoiceOver confirmation is rejected instead of receiving automatic input', async () => {
  const protocol = new PlainSetupProtocol()
  expect(() => protocol.accept('Optional: prepare VoiceOver testing.')).toThrow(
    'optional VoiceOver setup',
  )
  expect(protocol.confirmationSent).toBe(false)
})
