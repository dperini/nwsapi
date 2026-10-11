import { parseArgs } from 'node:util'
import { TASKS } from './actions.mts'
import type { TaskResult } from './execute.mts'

export function parseOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      plain: { type: 'boolean' },
      list: { type: 'boolean' },
      json: { type: 'boolean' },
      task: { type: 'string' },
    },
  })
  if (
    values.plain &&
    (values.json || values.list || values.task !== undefined)
  ) {
    throw new Error(
      '--plain cannot be combined with --json, --list, or --task.',
    )
  }
  if (values.list && values.task !== undefined) {
    throw new Error('Choose --list or --task, not both.')
  }
  if (
    values.task !== undefined &&
    !TASKS.some(task => task.script === values.task)
  ) {
    throw new Error('Unknown task. Use --list --json to discover task IDs.')
  }
  return values
}

function writeJson(value: object) {
  console.log(JSON.stringify({ schemaVersion: 1, ...value }))
}

export function printJsonTasks() {
  writeJson({
    type: 'tasks',
    tasks: TASKS.map((task, index) => ({
      id: task.script,
      order: index + 1,
      name: task.name,
      description: task.description,
      detail: task.detail,
      next: task.next,
      command: ['pnpm', 'run', task.script],
      persistent: task.persistent ?? false,
      optional: task.optional ?? false,
      execution: [
        'node',
        'scripts/repo/develop/run.mts',
        '--task',
        task.script,
        '--json',
      ],
    })),
  })
}

export function reportError(error: unknown, json: boolean) {
  const message = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
  if (json) {
    writeJson({ type: 'error', status: 'failed', message, exitCode: 1 })
  } else {
    console.error(message)
  }
}

export async function runTask(id: string, json: boolean) {
  const task = TASKS.find(candidate => candidate.script === id)
  if (!task) {
    throw new Error('Unknown task. Use --list --json to discover task IDs.')
  }
  let result: TaskResult
  try {
    const { executeTask } = await import('./execute.mts')
    result = await executeTask(task, { json, interactive: false })
  } catch (error) {
    result = {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      signal: null,
    }
  }
  process.exitCode = result.exitCode
  if (json) {
    writeJson({
      type: 'result',
      task: task.script,
      ...result,
      next: result.status === 'completed' ? task.next : null,
    })
  } else {
    console.log(result.message)
  }
}
