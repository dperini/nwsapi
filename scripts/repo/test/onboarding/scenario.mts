import { existsSync } from 'node:fs'
import { access, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertHarnessResult,
  assertTaskDiscovery,
  parseHarnessJson,
} from './protocol.mts'
import { readJourney } from './readme.mts'
import { resolveReadmeBootstrapRepairCommand } from './readme/commands.mts'
export { resolveReadmeBootstrapRepairCommand } from './readme/commands.mts'
export type { ResolvedReadmeHarnessCommand } from './readme/commands.mts'
import { externalToolVersion } from './environment.mts'
import { runPlainSetup } from './terminal.mts'
import { verifyBuildOutputs } from './build.mts'
export { verifyBuildOutputs } from './build.mts'
export type { BuildInventory } from './build.mts'
import type { BuildInventory } from './build.mts'

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
  durationMs?: number
}
export interface TerminalMenuOutcome {
  phase: string
  command: string
  status: string
  code: number | null
  durationMs?: number
  error?: string
}
export type GuideRunner = (
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  execution: string[],
  redact: (value: string) => string,
) => Promise<GuideOutcome>
export type BeforeSetup = () => Promise<void>
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
  const taskIndex = args.indexOf('--task')
  const task = taskIndex >= 0 ? args[taskIndex + 1] : ''
  const captureFailure =
    task === 'setup:check' && expectedStatus === 'completed'
  const result = await command(
    file,
    args.slice(1).join(' '),
    node,
    args.slice(1),
    checkout,
    env,
    undefined,
    captureFailure ? null : expectedExit,
  )
  if (captureFailure && result.code !== 0) {
    await captureReadinessDetails(file, checkout, node, env, command)
  }
  const object = parseHarnessJson(result.stdout)
  assertHarnessResult(object, expectedStatus, result.code, task!)
  return object
}

async function captureReadinessDetails(
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  await command(
    file,
    'setup diagnostics detail after readiness failure',
    node,
    ['scripts/repo/setup/doctor.mts', '--details'],
    checkout,
    env,
    undefined,
    null,
  )
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
  beforeSetup: BeforeSetup,
  installed = false,
  buildInventory?: BuildInventory,
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
  if ((!installed && !setup) || !guide || !review || !check) {
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
    installed ? 'completed' : 'failed',
    command,
  )
  if (!installed && before['exitCode'] === 0) {
    throw new Error('Setup diagnostics passed before setup.')
  }
  await beforeSetup()
  await rm(path.join(checkout, 'dist'), { recursive: true, force: true })
  if (installed) {
    const bootstrap = (await readJourney(checkout)).find(
      step => step.id === 'bootstrap',
    )
    if (!bootstrap) {
      throw new Error('README setup repair command is missing.')
    }
    const repair = resolveReadmeBootstrapRepairCommand(bootstrap, checkout, env)
    const repairResult = await command(
      log,
      'literal README setup repair',
      repair.executable,
      repair.args,
      checkout,
      repair.env,
    )
    if (repairResult.code !== 0) {
      throw new Error(
        `README setup repair failed with exit ${repairResult.code}.`,
      )
    }
  } else {
    await harness(
      log,
      checkout,
      node,
      env,
      setup!.execution,
      'completed',
      command,
    )
  }
  if (!(await exists(path.join(checkout, 'dist')))) {
    throw new Error('Setup did not rebuild dist/.')
  }
  await verifyBuildOutputs(log, checkout, node, env, command, buildInventory)
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
  return guideOutcome
}

export async function runPlainSetupMenu(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  redact: (value: string) => string,
): Promise<TerminalMenuOutcome> {
  if (process.platform !== 'linux') {
    const message = 'Skipped: real PTY menu is verified in the Linux journey.'
    await writeFile(log, `\n## plain terminal setup wizard\n${message}\n`, {
      flag: 'a',
    })
    return {
      phase: 'plain terminal setup wizard',
      command: 'skipped on non-Linux platform',
      status: 'skipped',
      code: null,
      durationMs: 0,
    }
  }
  const result = await runPlainSetup({
    checkout,
    node,
    env,
    timeoutMs: 20 * 60_000,
  })
  await writeFile(
    log,
    redact(
      `\n## plain terminal setup wizard\npreview=${result.previewObserved} confirmation=${result.confirmationSent} setup=${result.setupCompleted} exit=${result.code ?? 'null'} signal=${result.signal ?? 'none'} failure=${result.failure ?? 'none'}\n${result.stdout}\n${result.stderr}\n`,
    ),
    { flag: 'a' },
  )
  const success =
    !result.failure &&
    result.code === 0 &&
    result.signal === null &&
    result.previewObserved &&
    result.confirmationSent &&
    result.setupCompleted
  if (!success) {
    const reason = result.failure ?? `exit ${result.code ?? 'null'}`
    return {
      phase: 'plain terminal setup wizard',
      command:
        'node scripts/repo/develop/run.mts --plain; select setup; confirm',
      status: 'failed',
      code: result.code,
      error: `Plain terminal setup wizard did not complete: ${reason}. See ${log}`,
      durationMs: result.durationMs,
    }
  }
  return {
    phase: 'plain terminal setup wizard',
    command: 'node scripts/repo/develop/run.mts --plain; select setup; confirm',
    status: 'completed',
    code: result.code,
    durationMs: result.durationMs,
  }
}

export async function runPlainSetupPreview(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  redact: (value: string) => string,
  platform: NodeJS.Platform = process.platform,
): Promise<TerminalMenuOutcome> {
  if (platform !== 'linux') {
    return {
      phase: 'plain terminal setup preview',
      command: `skipped on ${platform}; preview PTY is verified on Linux only`,
      status: 'skipped',
      code: null,
      durationMs: 0,
    }
  }
  const result = await runPlainSetup({
    checkout,
    node,
    env,
    timeoutMs: 60_000,
    previewOnly: true,
    platform,
  })
  await writeFile(
    log,
    redact(
      `\n## plain terminal setup preview\npreview=${result.previewObserved} quit=${result.quitSent} confirmation=${result.confirmationSent} setup=${result.setupCompleted} exit=${result.code ?? 'null'} signal=${result.signal ?? 'none'} failure=${result.failure ?? 'none'}\n${result.stdout}\n${result.stderr}\n`,
    ),
    { flag: 'a' },
  )
  const success =
    !result.failure &&
    result.code === 0 &&
    result.signal === null &&
    result.previewObserved &&
    result.quitSent &&
    !result.confirmationSent &&
    !result.setupCompleted
  if (!success) {
    const reason = result.failure ?? `exit ${result.code ?? 'null'}`
    return {
      phase: 'plain terminal setup preview',
      command: 'node scripts/repo/develop/run.mts --plain; preview setup; quit',
      status: 'failed',
      code: result.code,
      error: `Plain terminal setup preview did not quit without execution: ${reason}. See ${log}`,
      durationMs: result.durationMs,
    }
  }
  return {
    phase: 'plain terminal setup preview',
    command: 'node scripts/repo/develop/run.mts --plain; preview setup; quit',
    status: 'completed',
    code: result.code,
    durationMs: result.durationMs,
  }
}
