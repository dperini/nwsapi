import { parseArgs } from 'node:util'
import { taskCommandArgs, TASKS } from './actions.mts'
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
      command: taskCommandArgs(task),
      persistent: false,
      manual: task.manual ?? false,
      optional: task.optional ?? false,
      execution: [
        'node',
        'scripts/develop/run.mts',
        '--task',
        task.script,
        '--json',
      ],
    })),
  })
}

export function taskResultJson(task: string, result: TaskResult) {
  const metadata = TASKS.find(candidate => candidate.script === task)
  return {
    schemaVersion: 1,
    type: 'result',
    task,
    ...result,
    next: result.status === 'completed' ? (metadata?.next ?? null) : null,
  }
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

export async function runTask(
  id: string,
  json: boolean,
  execute = async (
    task: (typeof TASKS)[number],
    options: { json: boolean; interactive: boolean },
  ) => {
    const { executeTask } = await import('./execute.mts')
    return executeTask(task, options)
  },
) {
  const task = TASKS.find(candidate => candidate.script === id)
  if (!task) {
    throw new Error('Unknown task. Use --list --json to discover task IDs.')
  }
  let result: TaskResult
  try {
    result = await execute(task, { json, interactive: false })
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
    console.log(JSON.stringify(taskResultJson(task.script, result)))
  } else {
    console.log(result.message)
  }
}
