import { existsSync } from 'node:fs'
import path from 'node:path'
import type { JourneyStep } from '../readme.mts'

export interface ResolvedReadmeHarnessCommand {
  executable: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export function resolveReadmeHarnessCommand(
  step: JourneyStep,
  checkout: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): ResolvedReadmeHarnessCommand {
  const expected =
    step.id === 'task-discovery'
      ? ['pnpm', '--silent', 'run', 'dev', '--list', '--json']
      : step.id === 'readiness'
        ? ['pnpm', '--silent', 'run', 'dev', '--task', 'setup:check', '--json']
        : undefined
  if (!expected || JSON.stringify(step.command) !== JSON.stringify(expected)) {
    throw new Error(`README ${step.id} must use its pinned pnpm task command.`)
  }
  return resolveManagedPnpmCommand(
    checkout,
    step.command.slice(1),
    env,
    platform,
  )
}

export function resolveReadmeBootstrapRepairCommand(
  step: JourneyStep,
  checkout: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): ResolvedReadmeHarnessCommand {
  if (
    step.id !== 'bootstrap' ||
    JSON.stringify(step.command) !== JSON.stringify(['pnpm', 'go'])
  ) {
    throw new Error('README setup repair must use pnpm go.')
  }
  return resolveManagedPnpmCommand(
    checkout,
    step.command.slice(1),
    env,
    platform,
  )
}

function resolveManagedPnpmCommand(
  checkout: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): ResolvedReadmeHarnessCommand {
  const bin = path.join(checkout, '.cache', 'bin')
  const executable = managedPnpmLauncherPath(checkout, platform)
  if (!existsSync(executable)) {
    throw new Error(
      'The managed pnpm launcher is missing. Install dependencies or run pnpm go to repair it.',
    )
  }
  const paths = [bin, env['PATH'] ?? ''].filter(Boolean)
  return {
    executable,
    args,
    env: {
      ...env,
      PATH: paths.join(path.delimiter),
    },
  }
}

export function managedPnpmLauncherPath(
  checkout: string,
  platform: NodeJS.Platform = process.platform,
) {
  return path.join(
    checkout,
    '.cache',
    'bin',
    platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  )
}
