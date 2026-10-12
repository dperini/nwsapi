import path from 'node:path'
import { constants } from 'node:os'
import { REPO_ROOT } from '../lib/paths.mts'
import type { Task } from './actions.mts'
import { runProcess } from './process.mts'
import { taskReadiness } from '../setup/readiness.mts'

async function taskCommand(task: Task) {
  // Setup and diagnostics must work before checkout tools have been installed.
  const entry = task.script === 'setup' ? 'bootstrap.mts' : 'doctor.mts'
  if (task.script === 'setup' || task.script === 'setup:check') {
    return {
      command: process.execPath,
      args: [path.join(REPO_ROOT, 'scripts/repo/setup', entry)],
      env: process.env,
    }
  }
  const { cachedToolchain, managedCommand, managedEnvironment } =
    await import('../setup/manager.mts')
  if (cachedToolchain()) {
    return {
      ...managedCommand(['run', task.script]),
      env: managedEnvironment(),
    }
  }
  throw new Error('Checkout tools need setup. Run pnpm run setup, then retry.')
}

export interface TaskResult {
  status: 'completed' | 'failed' | 'stopped'
  message: string
  exitCode: number
  signal: NodeJS.Signals | null
}

interface ExecutionOptions {
  json?: boolean
  interactive?: boolean
}

export function taskResult(
  task: Task,
  code: number | null,
  signal: NodeJS.Signals | null,
): TaskResult {
  if (signal) {
    return {
      status: 'stopped',
      message: `Stopped: ${task.name}.`,
      exitCode: 128 + (constants.signals[signal] ?? 1),
      signal,
    }
  }
  if (code === 0) {
    return {
      status: 'completed',
      message: `Finished: ${task.name}. ${task.next}`,
      exitCode: 0,
      signal: null,
    }
  }
  return {
    status: 'failed',
    message: `Failed (exit ${code ?? 1}): ${task.name}. Read the task output, then retry.`,
    exitCode: code ?? 1,
    signal: null,
  }
}

export async function executeTask(
  task: Task,
  { json = false, interactive = true }: ExecutionOptions = {},
): Promise<TaskResult> {
  const readiness = await taskReadiness(task.script, REPO_ROOT)
  if (!readiness.ready) {
    throw new Error(readiness.message)
  }
  const request = await taskCommand(task)
  const log = json ? console.error : console.log
  log(`\n${task.name}\nRunning: pnpm run ${task.script}\n`)
  if (task.persistent) {
    log(
      interactive
        ? 'Keep this server running while editing. Ctrl+C stops it and returns to the menu.\n'
        : 'This server runs until stopped. Send SIGINT or SIGTERM to finish.\n',
    )
  }
  const result = await runProcess(
    { ...request, cwd: REPO_ROOT },
    { json, interactive },
  )
  return taskResult(task, result.code, result.signal)
}
