import { parseArgs } from 'node:util'
import { TASKS } from './actions.mts'
import type { TaskResult } from './execute.mts'
import { bootstrapPlan } from '../setup/bootstrap.mts'

export function parseOptions(args: string[]) {
  const values = readOptions(args)
  validateOptionCombinations(values)
  validateVersionTask(values)
  return values
}

export function validateOptionCombinations(
  values: ReturnType<typeof readOptions>,
) {
  validatePlainOptions(values)
  validateTaskListOptions(values)
  validateSweepOptions(values)
  validateDescribeOptions(values)
  validateDryRunOptions(values)
}

export function validatePlainOptions(values: ReturnType<typeof readOptions>) {
  if (
    values.plain &&
    (values.json || values.list || values.task !== undefined)
  ) {
    throw new Error(
      '--plain cannot be combined with --json, --list, or --task.',
    )
  }
}

export function validateTaskListOptions(
  values: ReturnType<typeof readOptions>,
) {
  if (values.list && values.task !== undefined) {
    throw new Error('Choose --list or --task, not both.')
  }
}

export function validateSweepOptions(values: ReturnType<typeof readOptions>) {
  if (values.apply && !values.sweep) {
    throw new Error('--apply requires --sweep.')
  }
  if (values.sweep && (values.task !== undefined || values.list)) {
    throw new Error('--sweep cannot be combined with --task or --list.')
  }
  if (values.sweep && (values.version !== undefined || values.plain)) {
    throw new Error('--sweep cannot be combined with --version or --plain.')
  }
  validateDescribeOptions(values)
  validateDryRunOptions(values)
}

export function validateDescribeOptions(
  values: ReturnType<typeof readOptions>,
) {
  if (values.describe && (values.task !== undefined || values.list)) {
    throw new Error('--describe cannot be combined with --task or --list.')
  }
  if (values.describe && values['dry-run']) {
    throw new Error('Choose --describe or --dry-run.')
  }
}

export function validateDryRunOptions(values: ReturnType<typeof readOptions>) {
  if (values['dry-run'] && values.task !== 'setup') {
    throw new Error('--dry-run currently requires --task setup.')
  }
}

export function readOptions(args: string[]) {
  return parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      plain: { type: 'boolean' },
      list: { type: 'boolean' },
      json: { type: 'boolean' },
      task: { type: 'string' },
      version: { type: 'string' },
      sweep: { type: 'boolean' },
      apply: { type: 'boolean' },
      describe: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  }).values
}

export function developerDescription() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'dev',
    description:
      'Guide checkout setup, documentation, review, and diagnostics.',
    options: ['--json', '--describe', '--dry-run'],
    tasks: TASKS.map(task => ({
      id: task.script,
      name: task.name,
      description: task.description,
      changes: task.script === 'setup' ? 'declared' : 'not-declared',
    })),
  }
}

export function handleContractOptions(
  options: ReturnType<typeof parseOptions>,
) {
  if (options.describe) {
    const description = developerDescription()
    console.log(
      options.json
        ? JSON.stringify(description)
        : `${description.name}: ${description.description}\n${description.tasks.map(task => `${task.id}: ${task.description}`).join('\n')}\nUse --dry-run --task setup to preview setup paths.`,
    )
    return true
  }
  if (options['dry-run']) {
    const plan = bootstrapPlan()
    console.log(
      options.json
        ? JSON.stringify(plan)
        : `Would prepare setup in ${plan.root}:\n${plan.steps.map(step => `  ${step}`).join('\n')}\nTargets:\n${plan.targets.map(target => `  ${target}`).join('\n')}`,
    )
    return true
  }
  return false
}

export function validateVersionTask(values: ReturnType<typeof readOptions>) {
  if (values.version !== undefined && !['v2', 'v3'].includes(values.version)) {
    throw new Error('Unknown version. Choose --version v2 or --version v3.')
  }
  if (
    values.task !== undefined &&
    values.version === undefined &&
    !TASKS.some(task => task.script === values.task)
  ) {
    throw new Error('Unknown task. Use --list --json to discover task IDs.')
  }
}

export function writeJson(value: object) {
  console.log(JSON.stringify({ schemaVersion: 1, ...value }))
}

export function printJsonTasks(version?: 'v2' | 'v3') {
  writeJson({
    type: 'tasks',
    ...(version ? { selectedVersion: version } : {}),
    tasks: TASKS.map((task, index) => ({
      id: task.script,
      order: index + 1,
      name: task.name,
      description: task.description,
      detail: task.detail,
      next: task.next,
      command: task.command ?? ['pnpm', 'run', task.script],
      persistent: task.persistent ?? false,
      optional: task.optional ?? false,
      execution: version
        ? [
            'node',
            'scripts/repo/develop/run.mts',
            '--version',
            version,
            '--task',
            task.script,
            '--json',
          ]
        : [
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
