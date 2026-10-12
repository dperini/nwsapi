import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

export async function runBounded(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
) {
  let command = executable
  let commandArgs = args
  if (
    process.platform === 'win32' &&
    executable.toLowerCase().endsWith('.cmd')
  ) {
    command = process.env['ComSpec'] ?? 'cmd.exe'
    commandArgs = [
      '/d',
      '/s',
      '/c',
      `""${executable}" ${args.map(value => `"${value.replaceAll('"', '""')}"`).join(' ')}"`,
    ]
  }
  const grouped = process.platform !== 'win32'
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    detached: grouped,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsVerbatimArguments: process.platform === 'win32',
    windowsHide: true,
  })
  const output: { stdout: string; stderr: string } = { stdout: '', stderr: '' }
  const maximum = 16 * 1024 * 1024
  let timedOut = false
  let signal: NodeJS.Signals | null = null
  let escalation: NodeJS.Timeout | undefined
  const append = (kind: 'stdout' | 'stderr', chunk: Buffer) => {
    if (output[kind].length < maximum) {
      output[kind] += chunk
        .toString('utf8')
        .slice(0, maximum - output[kind].length)
    }
  }
  child.stdout.on('data', chunk => append('stdout', chunk))
  child.stderr.on('data', chunk => append('stderr', chunk))
  const kill = (requested: NodeJS.Signals) => {
    signal = requested
    if (process.platform === 'win32' && child.pid) {
      killWindowsTree(child)
    } else if (grouped && child.pid) {
      try {
        process.kill(-child.pid, requested)
      } catch {
        child.kill(requested)
      }
    } else {
      child.kill(requested)
    }
    escalation ??= setTimeout(() => {
      if (grouped && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      } else {
        killWindowsTree(child)
      }
    }, 5000)
    escalation.unref()
  }
  const interrupt = () => kill('SIGINT')
  const terminate = () => kill('SIGTERM')
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  const timer = setTimeout(() => {
    timedOut = true
    kill('SIGTERM')
  }, timeout)
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
    error?: Error
  }>(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }))
    child.once('close', (code, childSignal) =>
      resolve({ code, signal: childSignal }),
    )
  })
  try {
    const result = await closed
    if (grouped && signal) {
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        /* group exited */
      }
    } else if (process.platform === 'win32' && signal && child.pid) {
      killWindowsTree(child)
    }
    return {
      ...result,
      ...output,
      error: processError(
        result.error,
        timedOut,
        signal,
        timeout,
        executable,
        args,
      ),
    }
  } finally {
    clearTimeout(timer)
    clearTimeout(escalation)
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
  }
}

function processError(
  error: Error | undefined,
  timedOut: boolean,
  signal: NodeJS.Signals | null,
  timeout: number,
  executable: string,
  args: string[],
) {
  if (error) {
    return error
  }
  if (timedOut) {
    return new Error(
      `Timed out after ${Math.ceil(timeout / 60_000)}min: ${path.basename(executable)} ${args.join(' ')}`,
    )
  }
  if (signal) {
    return new Error(`Cancelled by ${signal}: ${path.basename(executable)}.`)
  }
  return undefined
}

function killWindowsTree(child: ReturnType<typeof spawn>) {
  if (!child.pid) {
    return
  }
  const taskkill = path.join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'taskkill.exe',
  )
  spawnSync(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
    stdio: 'ignore',
    timeout: 5000,
    windowsHide: true,
  })
}
