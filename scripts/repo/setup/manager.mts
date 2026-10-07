import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  SpawnSyncOptions,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from 'node:child_process'
import {
  TOOL_BIN,
  toolExecutable,
  toolVersions,
  toolchainState,
  toolchainStatePath,
} from '../external-tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { nodeInteropEnvironment } from '../node.mts'
import { setupTools } from './tools.mts'

export function managedEnvironment(directory = TOOL_BIN, env = process.env) {
  const result = nodeInteropEnvironment(env)
  const names = [
    'npm_execpath',
    'npm_node_execpath',
    'npm_config_user_agent',
    'npm_lifecycle_event',
    'npm_lifecycle_script',
    'npm_command',
  ]
  for (let i = 0, length = names.length; i < length; i += 1) {
    delete result[names[i]!]
  }
  result['PATH'] = directory + path.delimiter + (env['PATH'] ?? '')
  result['SFW_UNKNOWN_HOST_ACTION'] = 'ignore'
  return result
}

export function managedCommand(
  args: string[],
  directory = TOOL_BIN,
  platform = process.platform,
) {
  if (platform === 'win32') {
    return {
      command: toolExecutable('sfw'),
      args: [toolExecutable('pnpm'), ...args],
    }
  }
  return { command: path.join(directory, 'pnpm'), args }
}

export function cachedToolchain(
  directory = TOOL_BIN,
  read: (file: string, encoding: 'utf8') => string = readFileSync,
) {
  try {
    return read(toolchainStatePath(directory), 'utf8') === toolchainState()
  } catch {
    return false
  }
}

export async function ensureManagedTools(
  directory = TOOL_BIN,
  setup = setupTools,
  probe: (
    command: string,
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding,
  ) => { status: number | null; stdout: string | null } = spawnSync,
) {
  const names =
    process.platform === 'win32'
      ? ['node.exe', 'pnpm.cmd', 'npm.cmd', 'sfw.cmd', 'nub.cmd', 'mise.cmd']
      : ['node', 'pnpm', 'npm', 'sfw', 'nub', 'mise']
  const node = path.join(
    directory,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  const version = probe(node, ['--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  const pinned = ['npm', 'pnpm', 'nub', 'sfw', 'mise'] as const
  if (
    !cachedToolchain(directory) ||
    !names.every(name => existsSync(path.join(directory, name))) ||
    !pinned.every(name => existsSync(toolExecutable(name))) ||
    version.status !== 0 ||
    version.stdout?.trim() !== `v${toolVersions()['node']}`
  ) {
    await setup()
  }
  return directory
}

type Run = (
  command: string,
  args: string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>

export type ManagedResult = {
  status: number | null
  signal: NodeJS.Signals | null
  error?: Error | undefined
}

export type ManagedRun = (
  args: string[],
  directory?: string | undefined,
) => ManagedResult

export function executeManaged(
  args: string[],
  directory = TOOL_BIN,
  run: Run = spawnSync,
) {
  const request = managedCommand(args, directory)
  const result = run(request.command, request.args, {
    cwd: REPO_ROOT,
    env: managedEnvironment(directory),
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  return result
}

export async function handoff(
  entry: string,
  args: string[],
  setup = ensureManagedTools,
  run: ManagedRun = executeManaged,
) {
  const directory = await setup()
  const node = path.join(
    directory,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  return run(['exec', node, entry, ...args], directory)
}

export function setupNotice(agent = process.env['npm_config_user_agent']) {
  const version = toolVersions()['pnpm']!
  const invoked = agent?.split('/')[0]
  return invoked && invoked !== 'pnpm'
    ? `Using pnpm ${version} for this checkout.`
    : `Setting up this checkout with pnpm ${version}.`
}
