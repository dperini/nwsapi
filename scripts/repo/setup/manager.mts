import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
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
import { posixShim, windowsShim } from './firewall.mts'

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
  manager: 'pnpm' | 'npm' = 'pnpm',
) {
  if (platform === 'win32') {
    if (manager === 'npm') {
      return {
        command: toolExecutable('sfw'),
        args: [
          path.join(directory, 'node.exe'),
          toolExecutable('npm'),
          ...args,
        ],
      }
    }
    return {
      command: toolExecutable('sfw'),
      args: [toolExecutable('pnpm'), ...args],
    }
  }
  if (manager === 'npm') {
    return { command: path.join(directory, 'npm'), args }
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

export function firewallLaunchersReady(
  directory = TOOL_BIN,
  platform = process.platform,
  read = readFileSync,
  resolve: (file: string) => string = realpathSync,
) {
  try {
    const node = resolve(
      path.join(directory, platform === 'win32' ? 'node.exe' : 'node'),
    )
    const firewall = toolExecutable('sfw')
    const commands = {
      npm: { executable: node, args: [toolExecutable('npm')] },
      pnpm: { executable: toolExecutable('pnpm') },
    }
    const newline = platform === 'win32' ? '\r\n' : '\n'
    for (const name of ['npm', 'pnpm'] as const) {
      const lines =
        platform === 'win32'
          ? windowsShim(name, firewall, commands[name], directory)
          : posixShim(name, firewall, commands[name], directory)
      const launcher = path.join(
        directory,
        platform === 'win32' ? `${name}.cmd` : name,
      )
      if (read(launcher, 'utf8') !== lines.join(newline) + newline) {
        return false
      }
    }
    return true
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
  launchersReady: (directory: string) => boolean = firewallLaunchersReady,
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
    !launchersReady(directory) ||
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
  if (
    args[0] === 'install' &&
    result.status === 0 &&
    !result.signal &&
    existsSync(path.join(REPO_ROOT, 'node_modules', '.modules.yaml'))
  ) {
    // pnpm replaces npm's dependency layout but leaves its hidden lockfile.
    // Retire that stale installation marker only after pnpm succeeds.
    rmSync(path.join(REPO_ROOT, 'node_modules', '.package-lock.json'), {
      force: true,
    })
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

export async function handoffCapture(
  entry: string,
  args: string[],
  setup = ensureManagedTools,
) {
  const directory = await setup()
  const node = path.join(
    directory,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  const request = managedCommand(['exec', node, entry, ...args], directory)
  return spawnSync(request.command, request.args, {
    cwd: REPO_ROOT,
    env: managedEnvironment(directory),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['inherit', 'pipe', 'pipe'],
  })
}

export function setupNotice(agent = process.env['npm_config_user_agent']) {
  const version = toolVersions()['pnpm']!
  const invoked = agent?.split('/')[0]
  return invoked && invoked !== 'pnpm'
    ? `Using pnpm ${version} for this checkout.`
    : `Setting up this checkout with pnpm ${version}.`
}
