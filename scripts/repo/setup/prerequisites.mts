import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { toolPlan } from '../external-tools.mts'

export function requiredCommands(
  assets: readonly string[],
  platform = process.platform,
) {
  const commands = ['git']
  if (assets.some(asset => /\.(?:tar\.gz|tgz)$/.test(asset))) {
    commands.push('tar')
  }
  if (assets.some(asset => asset.endsWith('.zip'))) {
    commands.push(platform === 'win32' ? 'powershell' : 'unzip')
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
    const args =
      command === 'powershell'
        ? [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '$PSVersionTable.PSVersion.ToString()',
          ]
        : [command === 'unzip' ? '-v' : '--version']
    const result = run(command, args, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.error || result.status !== 0) {
      throw new Error(
        `Required command ${command} is unavailable. Install ${command} for this system, then retry node scripts/repo/setup/bootstrap.mts.`,
      )
    }
  }
}
