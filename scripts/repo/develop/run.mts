import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { TASKS } from './actions.mts'
import type { MenuState } from './actions.mts'
import { runProcess } from './process.mts'
import { choosePlain, printTasks, returnToMenu } from './plain.mts'
import {
  parseOptions,
  printJsonTasks,
  reportError,
  runTask,
} from './protocol.mts'

const HELP = `Usage: pnpm run dev [--plain | --list | --task <id>] [--json]

Guides you through setup, documentation, review, and optional setup help.
Arrow keys or 1–4 preview a task. Enter runs it. q or Esc quits.
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
  const state: MenuState = {
    selected: 0,
    result: 'Choose where to begin. You can return to any task.',
  }
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
    try {
      const { executeTask } = await import('./execute.mts')
      const task = TASKS[selected]!
      const outcome = await executeTask(task)
      state.result =
        outcome.status === 'completed' ? `Done. ${task.next}` : outcome.message
      const backFromDocs = task.persistent && outcome.signal === 'SIGINT'
      if (backFromDocs) {
        state.result =
          'Docs server stopped. When your change is ready, choose Review.'
      }
      if (outcome.status === 'stopped' && !backFromDocs) {
        console.log(`\n${state.result}`)
        process.exitCode = outcome.exitCode
        return
      }
    } catch (error) {
      state.result = `Failed: ${error instanceof Error ? error.message : String(error)}`
    }
    console.log(`\n${state.result}`)
    if (!(await returnToMenu())) {
      return
    }
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
