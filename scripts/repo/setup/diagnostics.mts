import { spawnSync } from 'node:child_process'
import { accessSync, constants, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import {
  TOOL_BIN,
  managedNodeEntry,
  toolExecutable,
  toolVersions,
} from '../external-tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { posixShim, windowsShim } from './firewall.mts'
import { cachedToolchain, managedEnvironment } from './manager.mts'

export type ToolName = 'node' | 'npm' | 'pnpm'

export function executableAvailable(file: string) {
  try {
    accessSync(
      file,
      process.platform === 'win32' ? constants.F_OK : constants.X_OK,
    )
    return true
  } catch {
    return false
  }
}

export function resolveExecutable(name: ToolName, env = process.env) {
  const entries = (env['PATH'] ?? '').split(path.delimiter)
  const extensions =
    process.platform === 'win32'
      ? ['', ...(env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';')]
      : ['']
  for (const [index, entry] of entries.entries()) {
    for (const extension of extensions) {
      const executable = path.resolve(entry, name + extension)
      if (executableAvailable(executable)) {
        return { executable, index }
      }
    }
  }
  return undefined
}

export function realExecutable(file: string) {
  try {
    return realpathSync(file)
  } catch {
    return undefined
  }
}

export function executableOwner(file: string | undefined) {
  if (!file) {
    return 'not found'
  }
  if (path.dirname(file) === TOOL_BIN) {
    return 'checkout'
  }
  const normalized = (realExecutable(file) ?? file).replaceAll('\\', '/')
  const owners = [
    ['/.nvm/', 'nvm'],
    ['/.local/share/mise/', 'mise'],
    ['/.local/share/fnm/', 'fnm'],
    ['/fnm_multishells/', 'fnm'],
    ['/.volta/', 'Volta'],
    ['/.asdf/', 'asdf'],
    ['/opt/homebrew/', 'Homebrew'],
    ['/Cellar/', 'Homebrew'],
  ] as const
  return (
    owners.find(([pattern]) => normalized.includes(pattern))?.[1] ??
    'external (owner unknown)'
  )
}

export function toolVersion(
  file: string,
  args = ['--version'],
  env = process.env,
) {
  const windowsScript =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(file)
  const command = windowsScript ? 'cmd.exe' : file
  const commandArgs = windowsScript
    ? ['/d', '/s', '/c', `""${file}" --version"`]
    : args
  const result = spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
    windowsVerbatimArguments: windowsScript,
  })
  return result.status === 0
    ? result.stdout.trim().match(/^v?(\d+\.\d+\.\d+)$/)?.[1]
    : undefined
}

export function managedEntry(name: ToolName) {
  if (name === 'node') {
    return managedNodeEntry()
  }
  const extension = process.platform === 'win32' ? '.cmd' : ''
  return path.join(TOOL_BIN, name + extension)
}

export function verifiedWrapper(name: 'npm' | 'pnpm') {
  try {
    const firewall = toolExecutable('sfw')
    const node = realExecutable(managedNodeEntry())
    if (!node || !executableAvailable(firewall)) {
      return false
    }
    const real =
      name === 'npm'
        ? { executable: node, args: [toolExecutable('npm')] }
        : { executable: toolExecutable('pnpm') }
    const windows = process.platform === 'win32'
    const lines = (windows ? windowsShim : posixShim)(name, firewall, real)
    const newline = windows ? '\r\n' : '\n'
    return (
      executableAvailable(managedEntry(name)) &&
      readFileSync(managedEntry(name), 'utf8') === lines.join(newline) + newline
    )
  } catch {
    return false
  }
}

export function managedVersions() {
  const node = managedEntry('node')
  const env = managedEnvironment()
  return {
    node: toolVersion(node, ['--version'], env),
    npm: toolVersion(node, [toolExecutable('npm'), '--version'], env),
    pnpm: toolVersion(toolExecutable('pnpm'), ['--version'], env),
  }
}

export function managedReady(versions: ReturnType<typeof managedVersions>) {
  const pins = toolVersions()
  return (
    cachedToolchain() &&
    (['node', 'npm', 'pnpm'] as const).every(
      name => versions[name] === pins[name],
    ) &&
    verifiedWrapper('npm') &&
    verifiedWrapper('pnpm')
  )
}

export function meetsMinimum(version: string | undefined, minimum: string) {
  if (!version) {
    return false
  }
  const actual = version.split('.').map(Number)
  const required = minimum.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index]! > required[index]!
    }
  }
  return true
}
