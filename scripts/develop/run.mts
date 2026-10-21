import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT, TOOL_BIN, TOOLCHAIN_STATE } from '../lib/external-tools.mjs'
import { runProcess } from './process.mts'
import { TASKS } from './actions.mts'
import type { MenuState } from './actions.mts'
import { readDeveloperState, writeDeveloperState } from './state.mts'
import type { DeveloperState, DeveloperStateIdentity } from './state.mts'
import { choosePlain, printTasks, returnToMenu } from './plain.mts'
import {
  parseOptions,
  printJsonTasks,
  reportError,
  runTask,
} from './protocol.mts'

const HELP = `Usage: npm run dev [-- --plain | --list | --task <id>] [--json]

Guides you through setup, documentation, review, and optional setup help.
Arrow keys or 1–4 preview a task. Enter runs it. q or Esc quits.
--plain  Use numbered text prompts.
--list   Print commands without running anything.
--task   Run one task by ID without menu prompts, then exit.
--json   Print JSON discovery or results. Task logs go to stderr.
-h, --help  Show this help.

Machine output: npm --silent run dev -- --list --json
Direct entry point: node scripts/develop/run.mts --task setup:check --json
JSON without --task lists tasks. Discovery needs no installed dependencies.

The visual menu uses @opentui/core with Node.js 26.4+ and experimental FFI.
Older runtimes and small terminals use text prompts. Noninteractive input lists tasks.
Direct commands remain available: npm run setup, docs, review, setup:check.`

function supportsNative() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major! > 26 || (major === 26 && minor! >= 4)
}

function pinnedNode() {
  const executable = path.join(
    TOOL_BIN,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  return existsSync(TOOLCHAIN_STATE) && existsSync(executable)
    ? executable
    : undefined
}

async function launchNative(args: string[], node: string) {
  const result = await runProcess(
    {
      command: node,
      args: [
        ...(node === process.execPath ? process.execArgv : []),
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
  const { identity, state } = createMenuContext()
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
    const task = TASKS[selected]!
    saveTaskState(identity, task.script, 'running', null, null)
    try {
      const { executeTask } = await import('./execute.mts')
      const outcome = await executeTask(task)
      saveTaskState(
        identity,
        task.script,
        outcome.status,
        outcome.exitCode,
        outcome.signal,
      )
      state.result =
        outcome.status === 'completed' ? `Done. ${task.next}` : outcome.message
      if (outcome.status === 'stopped') {
        console.log(`\n${state.result}`)
        process.exitCode = outcome.exitCode
        return
      }
    } catch (error) {
      state.result = `Failed: ${error instanceof Error ? error.message : String(error)}`
      saveTaskState(identity, task.script, 'failed', 1, null)
    }
    console.log(`\n${state.result}`)
    if (!(await returnToMenu())) {
      return
    }
  }
}

export function createMenuContext(
  root = REPO_ROOT,
  identity = checkoutIdentity(root),
) {
  const saved = readDeveloperState(
    root,
    identity,
    TASKS.map(task => task.script),
  )
  return {
    identity,
    state: {
      selected: saved
        ? TASKS.findIndex(task => task.script === saved.taskId)
        : 0,
      result: restoredResult(saved, identity.revision),
    } satisfies MenuState,
  }
}

function checkoutIdentity(root: string): DeveloperStateIdentity {
  let revision = 'unknown'
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Menu history can still be tied to its canonical checkout path.
  }
  return { checkout: realpathSync(root), revision }
}

function restoredResult(
  state: DeveloperState | undefined,
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
  identity: DeveloperStateIdentity,
  taskId: string,
  status: DeveloperState['status'],
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
  const plain = options.plain || process.env['TERM'] === 'dumb'
  const node = supportsNative() ? process.execPath : pinnedNode()
  if (!plain && node && !process.execArgv.includes('--experimental-ffi')) {
    await launchNative(args, node)
    return
  }
  await menuLoop(plain || !node)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
