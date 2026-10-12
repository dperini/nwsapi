import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { TASKS } from './actions.mts'
import { menuHelp } from './keys.mts'
import type { MenuState } from './actions.mts'
import type { TaskResult } from './execute.mts'
import { runProcess } from './process.mts'
import { menuReadiness } from '../setup/readiness.mts'
import { readDeveloperState, writeDeveloperState } from './state.mts'
import { choosePlain, printTasks, returnToMenu } from './plain.mts'
import {
  parseOptions,
  printJsonTasks,
  reportError,
  runTask,
} from './protocol.mts'

const HELP = `Usage: pnpm run dev [--plain | --list | --task <id>] [--json]

Guides you through setup, documentation, review, and optional setup help.
${menuHelp(TASKS.length)}
--plain  Use numbered text prompts.
--list   Print commands without running anything.
--task   Run one task by ID without menu prompts, then exit.
--json   Print JSON discovery or results. Task logs go to stderr.
-h, --help  Show this help.

For machine output: pnpm --silent run dev --list --json
Or: node scripts/repo/develop/run.mts --task setup:check --json
JSON without --task lists tasks. A persistent task runs until stopped.

The visual menu uses @opentui/core with Node.js 26.4+.
Older runtimes and terminals without native support use text prompts.
Direct commands remain available: pnpm run setup, guide, review, setup:check.`

function supportsNative() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major! > 26 || (major === 26 && minor! >= 4)
}

async function launchNative(args: string[]) {
  const result = await runProcess(
    {
      command: process.execPath,
      args: [
        ...process.execArgv,
        '--experimental-ffi',
        fileURLToPath(import.meta.url),
        ...args,
      ],
      cwd: REPO_ROOT,
      env: process.env,
    },
    { terminalOwner: true },
  )
  process.exitCode = result.code ?? (result.signal === 'SIGTERM' ? 143 : 130)
}

async function menuLoop(plain: boolean) {
  const { identity, state } = await createMenuContext()
  while (true) {
    let selected: number | undefined
    try {
      selected =
        plain || process.stdout.columns < 80 || process.stdout.rows < 24
          ? await choosePlain(state)
          : await (await import('./menu.mts')).chooseTask(state)
    } catch (error) {
      console.log(
        `Visual menu unavailable: ${(error as Error).message}\nUsing numbered text prompts.`,
      )
      plain = true
      continue
    }
    if (selected === undefined) {
      return
    }
    state.selected = selected
    if (await executeSelectedTask(selected, state, identity)) {
      return
    }
    if (!(await returnToMenu())) {
      return
    }
  }
}

async function createMenuContext() {
  const identity = checkoutIdentity()
  const saved = readDeveloperState(
    REPO_ROOT,
    identity,
    TASKS.map(task => task.script),
  )
  return {
    identity,
    state: {
      selected: saved
        ? TASKS.findIndex(task => task.script === saved.taskId)
        : 0,
      result: saved
        ? restoredResult(saved, identity.revision)
        : 'Choose where to begin. You can return to any task.',
      readiness: await menuReadiness(REPO_ROOT),
    } satisfies MenuState,
  }
}

async function executeSelectedTask(
  selected: number,
  state: MenuState,
  identity: ReturnType<typeof checkoutIdentity>,
) {
  const task = TASKS[selected]!
  try {
    const { executeTask } = await import('./execute.mts')
    saveTaskState(identity, task.script, 'running', null, null)
    const outcome = await executeTask(task)
    saveTaskState(
      identity,
      task.script,
      outcome.status,
      outcome.exitCode,
      outcome.signal,
    )
    state.result = taskOutcome(task, outcome)
    const backFromDocs = task.persistent && outcome.signal === 'SIGINT'
    if (outcome.status === 'stopped' && !backFromDocs) {
      process.exitCode = outcome.exitCode
      return true
    }
  } catch (error) {
    state.result = `Failed: ${error instanceof Error ? error.message : String(error)}`
    saveTaskState(identity, task.script, 'failed', 1, null)
  }
  state.readiness = await menuReadiness(REPO_ROOT)
  console.log(`\n${state.result}`)
  return false
}

function taskOutcome(task: (typeof TASKS)[number], outcome: TaskResult) {
  if (task.persistent && outcome.signal === 'SIGINT') {
    return 'Docs server stopped. When your change is ready, choose Review.'
  }
  return outcome.status === 'completed' ? `Done. ${task.next}` : outcome.message
}

function checkoutIdentity() {
  let revision = 'unknown'
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Menu history can still be tied to its canonical checkout path.
  }
  return { checkout: realpathSync(REPO_ROOT), revision }
}

function restoredResult(
  state: ReturnType<typeof readDeveloperState>,
  currentRevision: string,
) {
  if (!state) {
    return 'Choose where to begin. You can return to any task.'
  }
  const task = TASKS.find(candidate => candidate.script === state.taskId)
  const label = task?.name ?? state.taskId
  const status =
    state.status === 'running'
      ? 'was interrupted while running'
      : `was ${state.status}`
  const revision =
    state.revision === 'unknown'
      ? 'revision unknown'
      : state.revision === currentRevision
        ? `revision ${state.revision.slice(0, 8)}`
        : `older revision ${state.revision.slice(0, 8)}`
  return `Historical result (${state.updatedAt.slice(0, 16)}, ${revision}): ${label} ${status} (exit ${state.exitCode ?? 'unknown'}). This does not validate the current checkout.`
}

function saveTaskState(
  identity: ReturnType<typeof checkoutIdentity>,
  taskId: string,
  status: 'running' | 'completed' | 'failed' | 'stopped',
  exitCode: number | null,
  signal: string | null,
) {
  try {
    writeDeveloperState(REPO_ROOT, identity, {
      taskId,
      status,
      exitCode,
      signal,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error(
      `Could not save developer menu history: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function main(args = process.argv.slice(2)) {
  let options
  try {
    options = parseOptions(args)
  } catch (error) {
    reportError(error, args.includes('--json'))
    return
  }
  if (options.help) {
    console.log(HELP)
    return
  }
  if (options.task !== undefined) {
    await runTask(options.task, options.json ?? false)
    return
  }
  if (options.json) {
    printJsonTasks()
    return
  }
  if (options.list || !process.stdin.isTTY || !process.stdout.isTTY) {
    printTasks()
    return
  }
  const plain =
    options.plain || process.env['TERM'] === 'dumb' || !supportsNative()
  if (!plain && !process.execArgv.includes('--experimental-ffi')) {
    await launchNative(args)
    return
  }
  await menuLoop(plain)
}

if (isMainModule(import.meta.url)) {
  await main()
}
