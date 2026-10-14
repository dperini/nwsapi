import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

type TerminalChild = ChildProcessWithoutNullStreams
export type SpawnTerminal = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => TerminalChild

export interface PlainSetupOptions {
  checkout: string
  node: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  previewOnly?: boolean
  log?: (chunk: string) => void
  platform?: NodeJS.Platform
  spawnProcess?: SpawnTerminal
  exists?: (target: string) => boolean
  killProcess?: typeof process.kill
  signal?: AbortSignal
  maxOutputBytes?: number
}

export interface PlainSetupResult {
  stdout: string
  stderr: string
  code: number | null
  durationMs: number
  signal: NodeJS.Signals | null
  previewObserved: boolean
  confirmationSent: boolean
  quitSent: boolean
  setupCompleted: boolean
  failure?: string
}

type PromptAction = 'select-setup' | 'confirm-setup' | 'quit' | undefined
type PromptPhase = 'menu' | 'preview' | 'running' | 'complete' | 'finished'

export class PlainSetupProtocol {
  private phase: PromptPhase = 'menu'
  private visible = ''
  private readonly previewOnly: boolean
  previewObserved = false
  confirmationSent = false
  quitSent = false
  setupCompleted = false

  constructor(previewOnly = false) {
    this.previewOnly = previewOnly
  }

  accept(chunk: string): PromptAction {
    this.visible += stripVTControlCharacters(chunk)
    if (this.visible.includes('Optional: prepare VoiceOver testing.')) {
      throw new Error('The terminal journey reached optional VoiceOver setup.')
    }
    if (this.phase === 'menu') {
      if (this.visible.includes('Preview a task:')) {
        this.phase = 'preview'
        this.visible = ''
        return 'select-setup'
      }
      return undefined
    }
    if (this.phase === 'preview') {
      if (this.visible.includes('Enter to run, b to go back, or q to quit:')) {
        this.previewObserved =
          this.visible.includes('Set up this checkout') &&
          this.visible.includes('Command:')
        if (!this.previewObserved) {
          throw new Error('The setup task preview was incomplete.')
        }
        if (this.previewOnly) {
          this.phase = 'finished'
          this.visible = ''
          return 'quit'
        }
        this.phase = 'running'
        this.visible = ''
        return 'confirm-setup'
      }
      return undefined
    }
    if (this.phase === 'running') {
      if (
        this.visible.includes(
          'Done. Next: open the documentation and choose a change.',
        )
      ) {
        this.setupCompleted = true
        this.phase = 'complete'
        if (
          this.visible.includes('Enter to return to the menu, or q to quit:')
        ) {
          this.phase = 'finished'
          this.visible = ''
          return 'quit'
        }
        this.visible = ''
      }
      return undefined
    }
    if (
      this.phase === 'complete' &&
      this.visible.includes('Enter to return to the menu, or q to quit:')
    ) {
      this.phase = 'finished'
      return 'quit'
    }
    return undefined
  }

  markConfirmationSent() {
    this.confirmationSent = true
  }
}

export async function runPlainSetup(
  options: PlainSetupOptions,
): Promise<PlainSetupResult> {
  const started = Date.now()
  const platform = options.platform ?? process.platform
  if (platform === 'win32') {
    throw new Error('The PTY setup journey is not supported on Windows.')
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('The PTY setup journey needs a positive timeout.')
  }
  const exists = options.exists ?? existsSync
  const targets = [
    path.join(options.checkout, 'node_modules'),
    path.join(options.checkout, '.cache'),
  ]
  const existedBefore = targets.map(target => exists(target))
  if (options.previewOnly && existedBefore.some(Boolean)) {
    throw new Error(
      'Preview verification requires a fresh checkout without tools or dependencies.',
    )
  }
  const request = terminalCommand(options.checkout, options.node, platform)
  const spawnTerminal = options.spawnProcess ?? spawn
  const child = spawnTerminal(request.command, request.args, {
    cwd: options.checkout,
    env: options.env,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as unknown as TerminalChild
  const protocol = new PlainSetupProtocol(options.previewOnly)
  const maxOutputBytes = options.maxOutputBytes ?? 2_000_000
  let stdout = ''
  let stderr = ''
  let outputBytes = 0
  let failure: string | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let escalation: ReturnType<typeof setTimeout> | undefined
  let settled = false

  return new Promise(resolve => {
    const killProcess =
      options.killProcess ??
      ((pid: number, signal: NodeJS.Signals) => process.kill(pid, signal))
    const stop = (reason: string) => {
      if (failure) {
        return
      }
      failure = reason
      terminate(child, platform, killProcess, 'SIGTERM')
      escalation = setTimeout(
        () => terminate(child, platform, killProcess, 'SIGKILL'),
        500,
      )
      escalation.unref()
    }
    const checkNoEarlyCreation = () => {
      for (let index = 0; index < targets.length; index += 1) {
        if (!existedBefore[index] && exists(targets[index]!)) {
          throw new Error(
            `Setup created ${path.relative(options.checkout, targets[index]!)} before confirmation.`,
          )
        }
      }
    }
    const send = (value: string) => {
      child.stdin.write(value)
    }
    const onStdout = (data: Buffer | string) => {
      const chunk = data.toString()
      stdout = appendOutput(stdout, chunk, maxOutputBytes)
      outputBytes += Buffer.byteLength(chunk)
      options.log?.(chunk)
      if (outputBytes > maxOutputBytes) {
        stop(`Terminal output exceeded ${maxOutputBytes} bytes.`)
        return
      }
      try {
        if (!protocol.confirmationSent) {
          checkNoEarlyCreation()
        }
        const action = protocol.accept(chunk)
        if (action === 'select-setup') {
          send('1\n')
        } else if (action === 'confirm-setup') {
          send('\n')
          protocol.markConfirmationSent()
        } else if (action === 'quit') {
          send('q\n')
          protocol.quitSent = true
        }
      } catch (error) {
        stop(error instanceof Error ? error.message : String(error))
      }
    }
    const onStderr = (data: Buffer | string) => {
      const chunk = data.toString()
      stderr = appendOutput(stderr, chunk, maxOutputBytes)
      outputBytes += Buffer.byteLength(chunk)
      options.log?.(chunk)
      if (outputBytes > maxOutputBytes) {
        stop(`Terminal output exceeded ${maxOutputBytes} bytes.`)
        return
      }
      if (!protocol.confirmationSent) {
        try {
          checkNoEarlyCreation()
        } catch (error) {
          stop(error instanceof Error ? error.message : String(error))
        }
      }
    }
    const onError = (error: Error) => {
      stop(`Could not start the PTY setup journey: ${error.message}`)
    }
    const onAbort = () => stop('The PTY setup journey was cancelled.')
    const onInterrupt = () =>
      stop('The PTY setup journey was cancelled by SIGINT.')
    const onTerminate = () =>
      stop('The PTY setup journey was cancelled by SIGTERM.')
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      clearTimeout(escalation)
      options.signal?.removeEventListener('abort', onAbort)
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
      const result: PlainSetupResult = {
        stdout,
        stderr,
        code,
        durationMs: Date.now() - started,
        signal,
        previewObserved: protocol.previewObserved,
        confirmationSent: protocol.confirmationSent,
        quitSent: protocol.quitSent,
        setupCompleted: protocol.setupCompleted,
        ...(failure ? { failure } : {}),
      }
      resolve(result)
    }
    child.stdout.on('data', onStdout)
    child.stderr.on('data', onStderr)
    child.once('error', onError)
    child.once('close', finish)
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onTerminate)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    timeout = setTimeout(
      () =>
        stop(`The PTY setup journey timed out after ${options.timeoutMs}ms.`),
      options.timeoutMs,
    )
    if (options.signal?.aborted) {
      onAbort()
    }
  })
}

function terminalCommand(
  checkout: string,
  node: string,
  platform: NodeJS.Platform,
) {
  const runner = path.join(checkout, 'scripts/repo/develop/run.mts')
  if (platform === 'linux') {
    const command = [node, runner, '--plain'].map(shellQuote).join(' ')
    return {
      command: 'script',
      args: ['-q', '-e', '-c', command, '/dev/null'],
    }
  }
  return {
    command: 'script',
    args: ['-q', '/dev/null', node, runner, '--plain'],
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function appendOutput(current: string, chunk: string, limit: number) {
  const remaining = Math.max(0, limit - Buffer.byteLength(current))
  if (Buffer.byteLength(chunk) <= remaining) {
    return current + chunk
  }
  return current + Buffer.from(chunk).subarray(0, remaining).toString()
}

function terminate(
  child: TerminalChild,
  platform: NodeJS.Platform,
  killProcess: typeof process.kill,
  signal: NodeJS.Signals,
) {
  if (platform !== 'win32' && child.pid) {
    try {
      killProcess(-child.pid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        child.kill(signal)
      }
    }
  } else {
    child.kill(signal)
  }
}
