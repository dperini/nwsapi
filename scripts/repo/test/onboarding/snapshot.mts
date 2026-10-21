import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, symlinkSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { normalizePath } from '../../lib/paths.mts'
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
import {
  bootstrapNodeIssue,
  nodeMeetsSecurityFloor,
} from '../../setup/node-version.mts'

export interface SnapshotContext {
  gitExecutable: string
  env: NodeJS.ProcessEnv
  snapshot: string
  initialCommit: string
  manifests: Record<string, string | null>
  sentinels: Record<string, string | null>
  nodeVersion: string
}

export async function verifySnapshotIntegrity(context: SnapshotContext) {
  const finalManifests = await hashes(context.snapshot, [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ])
  if (JSON.stringify(context.manifests) !== JSON.stringify(finalManifests)) {
    throw new Error('Install changed package manifests or lockfiles.')
  }
  const sentinelsAfter = await hashes(
    path.join(path.dirname(context.snapshot), 'home'),
    Object.keys(context.sentinels),
  )
  if (JSON.stringify(context.sentinels) !== JSON.stringify(sentinelsAfter)) {
    throw new Error('Shell/global-config sentinel changed.')
  }
  const finalHead = execFileSync(context.gitExecutable, ['rev-parse', 'HEAD'], {
    cwd: context.snapshot,
    env: context.env,
    encoding: 'utf8',
  }).trim()
  if (finalHead !== context.initialCommit) {
    throw new Error('Snapshot HEAD changed during onboarding.')
  }
}

interface EnvironmentContext {
  gitExecutable: string
  env: NodeJS.ProcessEnv
  snapshot: string
}
type Scenario = ScenarioOptions['scenario']
type CommandResult = {
  code: number | null
  durationMs?: number
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

export function protectedPath(paths: string[]) {
  return paths.join(path.delimiter)
}

export function absentArtifacts(checkout: string) {
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
  recordCommit: (commit: string) => void,
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
  const tree = run(
    gitExecutable,
    ['cat-file', '-e', `${sourceCommit}^{tree}`],
    repo,
    env,
    15_000,
  )
  if (tree.code === 0) {
    recordCommit(sourceCommit)
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
  } else {
    const snapshotCommit = await createWorkingTreeSnapshot(
      log,
      repo,
      snapshot,
      env,
      gitExecutable,
      run,
      appendLog,
      command,
    )
    recordCommit(snapshotCommit)
  }
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
    '.zprofile',
    '.bash_profile',
    '.profile',
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

export async function copyTrackedTree(
  source: string,
  destination: string,
  files: string[],
) {
  const included = new Set<string>()
  for (const file of files) {
    const relative = normalizePath(file)
    included.add(relative)
    const segments = relative.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      included.add(segments.slice(0, index).join('/'))
    }
  }
  const excluded = new Set([
    '.git',
    '.cache',
    'coverage',
    'dist',
    'node_modules',
  ])
  await cp(source, destination, {
    recursive: true,
    filter(entry) {
      const relative = normalizePath(path.relative(source, entry))
      if (relative === '.') {
        return true
      }
      const segments = relative.split('/')
      if (segments.some(segment => excluded.has(segment))) {
        return false
      }
      return included.has(relative)
    },
  })
}

export async function createWorkingTreeSnapshot(
  log: string,
  repo: string,
  snapshot: string,
  env: NodeJS.ProcessEnv,
  gitExecutable: string,
  run: SyncRunner,
  appendLog: AppendLogger,
  command: CommandRunner,
) {
  const listed = run(
    gitExecutable,
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    repo,
    env,
    30_000,
  )
  await appendLog(log, 'list source files for local snapshot', listed)
  await rm(snapshot, { recursive: true, force: true })
  await copyTrackedTree(
    repo,
    snapshot,
    listed.stdout.split('\0').filter(Boolean),
  )
  await command(
    log,
    'initialize isolated snapshot repository',
    gitExecutable,
    ['init', '--initial-branch=onboarding'],
    snapshot,
    env,
  )
  await command(
    log,
    'stage isolated snapshot files',
    gitExecutable,
    ['add', '--all', '--force'],
    snapshot,
    env,
  )
  await command(
    log,
    'commit isolated snapshot files',
    gitExecutable,
    [
      '-c',
      'user.name=Onboarding',
      '-c',
      'user.email=onboarding@localhost',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '-m',
      'Onboarding snapshot',
    ],
    snapshot,
    env,
  )
  const head = run(gitExecutable, ['rev-parse', 'HEAD'], snapshot, env)
  if (head.code !== 0) {
    throw new Error('Cannot read the isolated snapshot commit.')
  }
  return head.stdout.trim()
}

export async function requireReadmeSteps(snapshot: string) {
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

export async function requireSupportedNode(
  scenario: Scenario,
  version: string,
  snapshot: string,
) {
  if (!nodeMeetsSecurityFloor(version)) {
    throw new Error(bootstrapNodeIssue(version))
  }
  if (scenario !== 'bootstrap') {
    const pin = await externalToolVersion(snapshot, 'node')
    if (version.replace(/^v/, '') !== pin) {
      throw new Error(`${scenario} lane requires pinned Node ${pin}.`)
    }
  }
}
