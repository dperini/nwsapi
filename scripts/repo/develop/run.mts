import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { TASKS } from './actions.mts'
import { menuHelp } from './keys.mts'
import { runVersion } from './version/run.mts'
import { sweepWorktrees } from './worktree/sweep.mts'
import { claimWorktree, inspectPulse } from './worktree/lease.mts'
import type { WorktreeMetadata } from './worktree/lease.mts'
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
--version v2|v3  Select the 2.x or 3.x product checkout.
--sweep [--apply]  Preview or perform conservative helper-owned cleanup.
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

export async function main(
  args = process.argv.slice(2),
  repository = REPO_ROOT,
) {
  let options
  try {
    options = parseOptions(args)
  } catch (error) {
    reportError(error, args.includes('--json'))
    return
  }
  await dispatchOptions(options, args, repository)
}

function isVersionDiscovery(options: ReturnType<typeof parseOptions>) {
  return Boolean(
    options.version &&
    options.task === undefined &&
    (options.json || options.list),
  )
}

async function dispatchOptions(
  options: ReturnType<typeof parseOptions>,
  args: string[],
  repository: string,
) {
  if (options.help) {
    console.log(HELP)
    return
  }
  if (options.sweep) {
    await runSweep(options)
    return
  }
  if (isVersionDiscovery(options)) {
    printVersionDiscovery(
      options.version as 'v2' | 'v3',
      options.json ?? false,
      repository,
    )
    return
  }
  if (options.version) {
    await dispatchVersion(options, args, repository)
    return
  }
  if (isTaskList(options)) {
    printTaskList(options.json ?? false)
    return
  }
  if (isNonInteractiveDiscovery(options)) {
    await runStandard(options, args)
    return
  }
  try {
    await withCurrentWorktreeLease(repository, () => runStandard(options, args))
  } catch (error) {
    reportError(error, options.json ?? false)
  }
}

function isTaskList(options: ReturnType<typeof parseOptions>) {
  return options.task === undefined && (options.json || options.list)
}

function printTaskList(json: boolean) {
  if (json) {
    printJsonTasks()
  } else {
    printTasks()
  }
}

function isNonInteractiveDiscovery(options: ReturnType<typeof parseOptions>) {
  return (
    options.task === undefined &&
    (options.list || !process.stdin.isTTY || !process.stdout.isTTY)
  )
}

async function dispatchVersion(
  options: ReturnType<typeof parseOptions>,
  args: string[],
  repository: string,
) {
  try {
    await runVersion(
      options.version as 'v2' | 'v3',
      args.filter(
        (arg, index) =>
          !arg.startsWith('--version=') &&
          arg !== '--version' &&
          args[index - 1] !== '--version',
      ),
      repository,
    )
  } catch (error) {
    reportError(error, options.json ?? false)
  }
}

function printVersionDiscovery(
  version: 'v2' | 'v3',
  json: boolean,
  repository: string,
) {
  const branch = version === 'v2' ? 'master' : 'prerelease/3.0.0'
  const runner =
    version === 'v2'
      ? 'scripts/develop/run.mts'
      : 'scripts/repo/develop/run.mts'
  const sourceBranch = execFileSync('git', ['branch', '--show-current'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim()
  const currentVersion =
    sourceBranch === 'master'
      ? 'v2'
      : sourceBranch === 'prerelease/3.0.0'
        ? 'v3'
        : existsSync(path.join(repository, 'scripts/develop/run.mts')) !==
            existsSync(path.join(repository, 'scripts/repo/develop/run.mts'))
          ? existsSync(path.join(repository, 'scripts/develop/run.mts'))
            ? 'v2'
            : 'v3'
          : undefined
  let available = false
  try {
    execFileSync('git', ['cat-file', '-e', `${branch}:${runner}`], {
      cwd: repository,
      stdio: 'ignore',
    })
    available = true
  } catch {
    available = false
  }
  const usable = available && currentVersion === version
  if (usable) {
    if (json) {
      printJsonTasks(version)
    } else {
      printTasks()
    }
    return
  }
  const message = available
    ? `The ${version} runner exists on ${branch}. Select that checkout to discover its tasks.`
    : `${version} does not provide the guided runner at ${runner}. Use the package commands in its package.json.`
  if (json) {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        type: 'tasks',
        selectedVersion: version,
        runnerAvailable: available,
        message,
        tasks: [],
      }),
    )
  } else {
    console.log(message)
  }
}

async function runStandard(
  options: ReturnType<typeof parseOptions>,
  args: string[],
) {
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

async function runSweep(options: ReturnType<typeof parseOptions>) {
  try {
    const results = await sweepWorktrees(REPO_ROOT, options.apply ?? false)
    if (options.json) {
      console.log(
        JSON.stringify({
          schemaVersion: 1,
          type: 'worktree-sweep',
          mode: options.apply ? 'apply' : 'preview',
          results,
        }),
      )
      return
    }
    console.log(options.apply ? 'Worktree sweep:' : 'Worktree sweep preview:')
    for (const result of results) {
      console.log(`${result.status}: ${result.path} (${result.reason})`)
    }
    if (!options.apply) {
      console.log('Pass --apply to remove only entries reported as eligible.')
    }
  } catch (error) {
    reportError(error, options.json ?? false)
  }
}

async function withCurrentWorktreeLease<T>(
  repository: string,
  action: () => Promise<T>,
) {
  const checkout = realpathSync(repository)
  const metadataPath = path.join(
    path.dirname(checkout),
    '.nwsapi-worktree.json',
  )
  if (!existsSync(metadataPath)) {
    return action()
  }
  const metadata = JSON.parse(
    readFileSync(metadataPath, 'utf8'),
  ) as WorktreeMetadata
  if (metadata.path === checkout && metadata.hostname !== hostname()) {
    throw new Error(
      `Worktree metadata at ${metadataPath} belongs to another or unknown host. Preserve the checkout and inspect its owner before running tasks.`,
    )
  }
  if (
    metadata.path !== checkout ||
    metadata.hostname !== hostname() ||
    !['v2', 'v3'].includes(metadata.version)
  ) {
    return action()
  }
  const pulsePath = path.join(path.dirname(checkout), '.nwsapi-pulse.json')
  const inheritedToken = process.env['NWSAPI_WORKTREE_LEASE_TOKEN']
  const inheritedPath = process.env['NWSAPI_WORKTREE_PATH']
  const pulse = await inspectPulse(pulsePath)
  if (
    inheritedToken &&
    inheritedToken === metadata.leaseToken &&
    inheritedToken === pulse.token &&
    inheritedPath === checkout &&
    pulse.active
  ) {
    return action()
  }
  const lease = await claimWorktree(metadata, pulsePath)
  const previousToken = process.env['NWSAPI_WORKTREE_LEASE_TOKEN']
  const previousPath = process.env['NWSAPI_WORKTREE_PATH']
  process.env['NWSAPI_WORKTREE_LEASE_TOKEN'] = lease.token
  process.env['NWSAPI_WORKTREE_PATH'] = checkout
  try {
    return await action()
  } finally {
    if (previousToken === undefined) {
      delete process.env['NWSAPI_WORKTREE_LEASE_TOKEN']
    } else {
      process.env['NWSAPI_WORKTREE_LEASE_TOKEN'] = previousToken
    }
    if (previousPath === undefined) {
      delete process.env['NWSAPI_WORKTREE_PATH']
    } else {
      process.env['NWSAPI_WORKTREE_PATH'] = previousPath
    }
    await lease.release()
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
