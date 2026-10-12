import { existsSync } from 'node:fs'
import { access, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertHarnessResult,
  assertTaskDiscovery,
  parseHarnessJson,
} from './protocol.mts'
import { readJourney } from './readme.mts'
import { externalToolVersion } from './environment.mts'

export interface CommandOutput {
  code: number | null
  signal?: NodeJS.Signals | null
  stdout: string
  stderr: string
  error?: Error | undefined
}
export type CommandRunner = (
  file: string,
  phase: string,
  executable: string,
  args: string[],
  checkout: string,
  env: NodeJS.ProcessEnv,
  timeout?: number,
  expected?: number | null,
) => Promise<CommandOutput>
export interface GuideOutcome {
  command: string
  code: number | null
}
export type GuideRunner = (
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  execution: string[],
  redact: (value: string) => string,
) => Promise<GuideOutcome>
export interface ScenarioOptions {
  scenario: 'bootstrap' | 'npm' | 'pnpm' | 'journey'
  node: string
  npm?: string
  pnpm?: string
  keep?: boolean
}

function protectedPath(paths: string[]) {
  return paths.join(path.delimiter)
}
async function exists(target: string) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function harness(
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  args: string[],
  expectedStatus: string,
  command: CommandRunner,
) {
  const expectedExit = expectedStatus === 'failed' ? 1 : 0
  const result = await command(
    file,
    args.slice(1).join(' '),
    node,
    args.slice(1),
    checkout,
    env,
    undefined,
    expectedExit,
  )
  const object = parseHarnessJson(result.stdout)
  const taskIndex = args.indexOf('--task')
  const task = taskIndex >= 0 ? args[taskIndex + 1] : ''
  assertHarnessResult(object, expectedStatus, result.code, task!)
  return object
}

export async function verifyInstalledCheckout(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
  managerVersions: Record<string, string>,
) {
  const discovery = await command(
    log,
    'guided task discovery',
    node,
    ['scripts/repo/develop/run.mts', '--list', '--json'],
    checkout,
    env,
  )
  const discoveryData = parseHarnessJson(discovery.stdout)
  assertTaskDiscovery(discoveryData)
  const tasks = discoveryData['tasks'] as Array<{
    id: string
    execution: string[]
  }>
  const check = tasks.find(task => task.id === 'setup:check')
  if (!check) {
    throw new Error('Setup diagnostics task is missing from harness discovery.')
  }
  await harness(log, checkout, node, env, check.execution, 'completed', command)
  await verifyBuildOutputs(log, checkout, node, env, command)
  const wrapperEnv = {
    ...env,
    PATH: protectedPath([
      path.join(checkout, '.cache', 'bin'),
      env['PATH'] ?? '',
    ]),
  }
  for (const manager of ['npm', 'pnpm'] as const) {
    const suffix = process.platform === 'win32' ? '.cmd' : ''
    const wrapper = path.join(checkout, '.cache', 'bin', `${manager}${suffix}`)
    if (!existsSync(wrapper)) {
      throw new Error(
        `Lifecycle did not install the ${manager} Firewall launcher.`,
      )
    }
    const result = await command(
      log,
      `${manager} Firewall launcher smoke check`,
      wrapper,
      ['--version'],
      checkout,
      wrapperEnv,
      30_000,
    )
    const expected = await externalToolVersion(checkout, manager)
    if (result.stdout.trim() !== expected) {
      throw new Error(
        `${manager} Firewall launcher reported ${result.stdout.trim()}, expected ${expected}.`,
      )
    }
    managerVersions[manager] = result.stdout.trim()
  }
}

export async function verifyEntryPath(
  log: string,
  options: ScenarioOptions,
  checkout: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
  managerVersions: Record<string, string>,
) {
  for (const name of ['npm', 'pnpm'] as const) {
    const executable = process.platform === 'win32' ? `${name}.cmd` : name
    if (options.scenario === name) {
      const result = await command(
        log,
        `declared ${name} PATH entry`,
        executable,
        ['--version'],
        checkout,
        env,
        15_000,
      )
      const expected = await externalToolVersion(checkout, name)
      if (result.stdout.trim() !== expected) {
        throw new Error(
          `${name} PATH entry reported ${result.stdout.trim()}, expected ${expected}.`,
        )
      }
      managerVersions[name] = result.stdout.trim()
    } else {
      const result = await command(
        log,
        `blocked undeclared ${name} PATH entry`,
        executable,
        ['--version'],
        checkout,
        env,
        15_000,
        125,
      )
      if (!result.stderr.includes('blocked undeclared command')) {
        throw new Error(
          `Undeclared ${name} did not resolve to the isolation guard.`,
        )
      }
    }
  }
}

export async function runJourney(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
  startGuide: GuideRunner,
  redact: (value: string) => string,
  recordGuide: (outcome: GuideOutcome) => void,
): Promise<GuideOutcome> {
  const list = await command(
    log,
    'harness task discovery',
    node,
    ['scripts/repo/develop/run.mts', '--list', '--json'],
    checkout,
    env,
  )
  const discovery = parseHarnessJson(list.stdout)
  assertTaskDiscovery(discovery)
  const tasks = discovery['tasks'] as Array<{
    id: string
    execution: string[]
  }>
  const setup = tasks.find(task => task.id === 'setup')
  const guide = tasks.find(task => task.id === 'guide')
  const review = tasks.find(task => task.id === 'review')
  const check = tasks.find(task => task.id === 'setup:check')
  if (!setup || !guide || !review || !check) {
    throw new Error(
      'Harness did not discover required setup, guide, review, and diagnostics tasks.',
    )
  }
  const before = await harness(
    log,
    checkout,
    node,
    env,
    check.execution,
    'failed',
    command,
  )
  if (before['exitCode'] === 0) {
    throw new Error('Setup diagnostics passed before setup.')
  }
  await harness(log, checkout, node, env, setup.execution, 'completed', command)
  await harness(log, checkout, node, env, check.execution, 'completed', command)
  const guideOutcome = await startGuide(
    log,
    checkout,
    node,
    env,
    guide.execution,
    redact,
  )
  recordGuide(guideOutcome)
  await harness(
    log,
    checkout,
    node,
    env,
    review.execution,
    'completed',
    command,
  )
  const setupScript = path.join(checkout, 'scripts/repo/setup/bootstrap.mts')
  await rm(path.join(checkout, 'dist'), { recursive: true, force: true })
  await command(
    log,
    'repeat setup after removing dist',
    node,
    [setupScript],
    checkout,
    env,
  )
  if (!(await exists(path.join(checkout, 'dist')))) {
    throw new Error('Repeat setup did not rebuild dist/.')
  }
  await verifyBuildOutputs(log, checkout, node, env, command)
  return guideOutcome
}

export async function runReadmeHarnessSteps(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  for (const step of await readJourney(checkout)) {
    if (step.id !== 'task-discovery' && step.id !== 'readiness') {
      continue
    }
    const args =
      step.command[0] === 'node' ? step.command.slice(1) : step.command
    const result = await command(
      log,
      `literal README ${step.id}`,
      node,
      args,
      checkout,
      env,
    )
    const value = parseHarnessJson(result.stdout)
    if (step.id === 'task-discovery') {
      assertTaskDiscovery(value)
    } else {
      assertHarnessResult(value, 'completed', result.code, 'setup:check')
    }
  }
}

export async function verifyBuildOutputs(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  const config = await import(
    pathToFileURL(path.join(checkout, '.config/build.config.mts')).href
  )
  for (const item of config.packageFiles as Array<{ output: string }>) {
    const output = path.join(checkout, item.output)
    if (!(await exists(output)) || (await stat(output)).size === 0) {
      throw new Error(`Build output is missing or empty: ${item.output}.`)
    }
  }
  await command(
    log,
    'package manifest and export check',
    node,
    ['scripts/repo/build/manifest.mts'],
    checkout,
    env,
  )
  await command(
    log,
    'built engine module load smoke check',
    node,
    ['-e', "require('./dist/nwsapi.js')"],
    checkout,
    env,
  )
}
