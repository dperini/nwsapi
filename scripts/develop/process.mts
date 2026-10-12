import { spawn } from 'node:child_process'

export interface ProcessRequest {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
  shell?: boolean
}

interface ProcessOptions {
  json?: boolean
  interactive?: boolean
  terminalOwner?: boolean
}

export async function runProcess(
  request: ProcessRequest,
  {
    json = false,
    interactive = true,
    terminalOwner = false,
  }: ProcessOptions = {},
) {
  const grouped = !interactive && process.platform !== 'win32'
  const child = spawn(request.command, request.args, {
    cwd: request.cwd,
    env: request.env,
    detached: grouped,
    shell: request.shell,
    stdio: [interactive ? 'inherit' : 'ignore', json ? 2 : 1, 2],
  })
  let requestedSignal: NodeJS.Signals | null = null
  let escalation: ReturnType<typeof setTimeout> | undefined
  const kill = (signal: NodeJS.Signals) => {
    if (grouped && child.pid) {
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          throw error
        }
      }
    } else {
      child.kill(signal)
    }
  }
  const stop = (signal: NodeJS.Signals) => {
    requestedSignal = signal
    kill(signal)
    escalation ??= setTimeout(() => kill('SIGKILL'), 5000)
    escalation.unref()
  }
  const interrupt = () => {
    if (!terminalOwner) {
      stop('SIGINT')
    }
  }
  const terminate = () => stop('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    const result = await new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    if (grouped && requestedSignal) {
      kill('SIGKILL')
    }
    return { code: result.code, signal: requestedSignal ?? result.signal }
  } finally {
    clearTimeout(escalation)
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
  }
}
