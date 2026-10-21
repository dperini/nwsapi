import path from 'node:path'
import { constants } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import {
  REPO_ROOT,
  TOOL_BIN,
  TOOLCHAIN_STATE,
  toolExecutable,
  toolchainState,
} from '../lib/external-tools.mjs'
import { managedEnvironment } from '../lib/tools/setup.mjs'
import { npmInvocation } from '../lib/npm.mjs'
import type { Task } from './actions.mts'
import { runProcess } from './process.mts'

function toolchainReady() {
  const node = path.join(
    TOOL_BIN,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  try {
    return (
      existsSync(node) &&
      existsSync(toolExecutable('npm')) &&
      JSON.stringify(JSON.parse(readFileSync(TOOLCHAIN_STATE, 'utf8'))) ===
        toolchainState()
    )
  } catch {
    return false
  }
}

function taskCommand(task: Task) {
  if (task.script === 'setup') {
    return {
      command: process.execPath,
      args: [path.join(REPO_ROOT, 'scripts/setup.mjs')],
      env: process.env,
    }
  }
  if (task.script === 'setup:check' || task.script === 'docs') {
    return {
      command: process.execPath,
      args: [
        path.join(
          REPO_ROOT,
          `scripts/develop/${task.script === 'docs' ? 'docs' : 'doctor'}.mts`,
        ),
      ],
      env: process.env,
    }
  }
  if (!toolchainReady()) {
    throw new Error(
      'Pinned tools are not ready. Run npm run setup, then retry.',
    )
  }
  const invocation = npmInvocation(['run', task.script])
  return {
    command: invocation.command,
    args: invocation.args,
    env: managedEnvironment(),
    shell: invocation.shell,
  }
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
  const request = taskCommand(task)
  const log = json ? console.error : console.log
  log(
    `\n${task.name}\nRunning: ${task.script === 'setup' ? 'node scripts/setup.mjs' : `npm run ${task.script}`}\n`,
  )
  const result = await runProcess(
    { ...request, cwd: REPO_ROOT },
    { json, interactive },
  )
  return taskResult(task, result.code, result.signal)
}
