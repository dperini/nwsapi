import { copyFileSync, existsSync, symlinkSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  externalToolVersion,
  findGit,
  hashes,
  stageCommands,
} from './environment.mts'
import { isolatedEnvironment } from './isolation.mts'
import { verifyEntryPath } from './scenario.mts'
import type { ScenarioOptions } from './scenario.mts'
import { readJourney } from './readme.mts'
import type { CommandRunner } from './scenario.mts'

export interface SnapshotContext {
  gitExecutable: string
  env: NodeJS.ProcessEnv
  snapshot: string
  initialCommit: string
  manifests: Record<string, string | null>
  sentinels: Record<string, string | null>
  nodeVersion: string
}
interface EnvironmentContext {
  gitExecutable: string
  env: NodeJS.ProcessEnv
  snapshot: string
}
type Scenario = ScenarioOptions['scenario']
type CommandResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  error: Error | undefined
}
type SyncRunner = (
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout?: number,
) => CommandResult
type AppendLogger = (
  file: string,
  phase: string,
  result: CommandResult,
) => Promise<void>

function protectedPath(paths: string[]) {
  return paths.join(path.delimiter)
}

function absentArtifacts(checkout: string) {
  for (const name of ['node_modules', 'dist', '.cache']) {
    if (existsSync(path.join(checkout, name))) {
      return name
    }
  }
  return undefined
}

export async function prepareEnvironment(
  options: ScenarioOptions,
  sandbox: string,
): Promise<{
  gitExecutable: string
  env: NodeJS.ProcessEnv
  snapshot: string
}> {
  const gitExecutable = findGit()
  const stagedBin = path.join(sandbox, 'entry-bin')
  await mkdir(stagedBin, { recursive: true })
  const stagedNode = path.join(
    stagedBin,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  if (process.platform === 'win32') {
    copyFileSync(path.resolve(options.node), stagedNode)
  } else {
    symlinkSync(path.resolve(options.node), stagedNode)
  }
  const manager =
    options.scenario === 'npm'
      ? options.npm
      : options.scenario === 'pnpm'
        ? options.pnpm
        : undefined
  await stageCommands(stagedBin, stagedNode, options.scenario, manager)
  const systemDirs =
    process.platform === 'win32'
      ? [
          path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32'),
          path.join(
            process.env['SystemRoot'] ?? 'C:\\Windows',
            'System32',
            'WindowsPowerShell',
            'v1.0',
          ),
        ]
      : ['/usr/bin', '/bin']
  const env = isolatedEnvironment(
    sandbox,
    protectedPath([stagedBin, path.dirname(gitExecutable), ...systemDirs]),
  )
  return {
    gitExecutable,
    env,
    snapshot: path.join(sandbox, 'checkout'),
  }
}

export async function checkoutSnapshot(
  options: ScenarioOptions,
  log: string,
  sandbox: string,
  environment: EnvironmentContext,
  run: SyncRunner,
  appendLog: AppendLogger,
  command: CommandRunner,
  managerVersions: Record<string, string>,
  repo: string,
): Promise<SnapshotContext> {
  const { gitExecutable, env, snapshot } = environment
  const sourceCommit = run(
    gitExecutable,
    ['rev-parse', 'HEAD'],
    repo,
    process.env,
    15_000,
  ).stdout.trim()
  if (!/^[0-9a-f]{40,64}$/i.test(sourceCommit)) {
    throw new Error(
      'Cannot capture exact source commit for the onboarding snapshot.',
    )
  }
  const clone = run(
    gitExecutable,
    ['clone', '--no-hardlinks', '--local', '--no-checkout', repo, snapshot],
    repo,
    env,
    60_000,
  )
  await appendLog(log, 'independent git clone', clone)
  await command(
    log,
    'checkout exact source commit',
    gitExecutable,
    ['checkout', '--detach', sourceCommit],
    snapshot,
    env,
    60_000,
  )
  await verifyEntryPath(log, options, snapshot, env, command, managerVersions)
  const head = run(gitExecutable, ['rev-parse', 'HEAD'], snapshot, env)
  if (head.code !== 0) {
    throw new Error('Cannot read snapshot commit.')
  }
  const dirty = run(gitExecutable, ['status', '--porcelain'], snapshot, env)
  if (dirty.stdout.trim()) {
    throw new Error('Fresh clone is unexpectedly dirty.')
  }
  const initialCommit = head.stdout.trim()
  const missing = absentArtifacts(snapshot)
  if (missing) {
    throw new Error(`Cold snapshot already contains ${missing}.`)
  }
  await requireReadmeSteps(snapshot)
  const sentinels = await hashes(path.join(sandbox, 'home'), [
    '.npmrc',
    '.pnpmrc',
    '.gitconfig',
    '.zshrc',
    '.bashrc',
    'profile',
    'sentinel',
  ])
  const manifests = await hashes(snapshot, [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ])
  const nodeVersion = (
    await command(
      log,
      'entry runtime version',
      options.node,
      ['--version'],
      snapshot,
      env,
      15_000,
    )
  ).stdout.trim()
  await requireSupportedNode(options.scenario, nodeVersion, snapshot)
  return {
    gitExecutable,
    env,
    snapshot,
    initialCommit,
    manifests,
    sentinels,
    nodeVersion,
  }
}

async function requireReadmeSteps(snapshot: string) {
  const steps = await readJourney(snapshot)
  const required = [
    'bootstrap',
    'task-discovery',
    'readiness',
    'npm-install',
    'pnpm-install',
  ]
  for (const id of required) {
    if (!steps.some(step => step.id === id)) {
      throw new Error(`README executable step ${id} is missing.`)
    }
  }
}

async function requireSupportedNode(
  scenario: Scenario,
  version: string,
  snapshot: string,
) {
  const nodeNumber = version.replace(/^v/, '').split('.').map(Number)
  if (nodeNumber[0]! < 22 || (nodeNumber[0] === 22 && nodeNumber[1]! < 18)) {
    throw new Error(`Node.js 22.18 or newer is required; got ${version}.`)
  }
  if (scenario !== 'bootstrap') {
    const pin = await externalToolVersion(snapshot, 'node')
    if (version.replace(/^v/, '') !== pin) {
      throw new Error(`${scenario} lane requires pinned Node ${pin}.`)
    }
  }
}
