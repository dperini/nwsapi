import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { toolPlan } from '../external-tools.mts'

export function resolvePowerShell(env = process.env) {
  const systemRoot = env['SystemRoot']
  return systemRoot
    ? path.win32.join(
        systemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      )
    : 'powershell.exe'
}

export function requiredCommands(
  assets: readonly string[],
  platform = process.platform,
  env = process.env,
) {
  const commands = ['git']
  if (assets.some(asset => /\.(?:tar\.gz|tgz)$/.test(asset))) {
    commands.push('tar')
  }
  if (assets.some(asset => asset.endsWith('.zip'))) {
    commands.push(platform === 'win32' ? resolvePowerShell(env) : 'unzip')
  }
  return commands
}

export type PrerequisiteProbe = (
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => { status: number | null; error?: Error }

export function checkPrerequisites(
  commands = requiredCommands(
    ['nub', 'pnpm', 'npm', 'sfw', 'mise'].map(
      name => toolPlan(name as 'npm' | 'nub' | 'pnpm' | 'sfw' | 'mise').asset,
    ),
  ),
  run: PrerequisiteProbe = spawnSync,
) {
  for (const command of commands) {
    const isPowerShell =
      path.win32.basename(command).toLowerCase() === 'powershell.exe'
    const args = isPowerShell
      ? [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$PSVersionTable.PSVersion.ToString()',
        ]
      : [command === 'unzip' ? '-v' : '--version']
    const timeout = isPowerShell ? 30_000 : 5000
    const result = run(command, args, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout,
      windowsHide: true,
    })
    if (result.error && 'code' in result.error) {
      const code = result.error.code
      if (code === 'ETIMEDOUT') {
        throw new Error(
          `Required command ${command} timed out after ${timeout}ms. Retry node scripts/repo/setup/bootstrap.mts.`,
        )
      }
      if (code === 'ENOENT') {
        throw new Error(
          `Required command ${command} is unavailable. Install it for this system, then retry node scripts/repo/setup/bootstrap.mts.`,
        )
      }
      throw new Error(
        `Required command ${command} failed: ${result.error.message}`,
      )
    }
    if (result.error || result.status !== 0) {
      const status =
        result.status === null
          ? 'without an exit status'
          : `with exit code ${result.status}`
      throw new Error(
        `Required command ${command} failed ${status}. Retry node scripts/repo/setup/bootstrap.mts.`,
      )
    }
  }
}
