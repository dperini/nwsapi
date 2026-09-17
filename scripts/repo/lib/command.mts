import { spawnSync } from 'node:child_process'
import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process'

export interface CommandOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  interactive?: boolean
}

export interface CommandResult {
  status: number
  stdout: string
  stderr: string
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandOptions,
) => CommandResult

export function execute(
  command: string,
  args: string[],
  options: CommandOptions,
): CommandResult {
  const settings: SpawnSyncOptionsWithStringEncoding = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  }
  const result = spawnSync(command, args, settings)
  if (result.error) {
    throw result.error
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function checked(
  command: string,
  args: string[],
  options: CommandOptions,
  run: CommandRunner = execute,
) {
  const result = run(command, args, options)
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr || result.stdout}`,
    )
  }
  return result.stdout.trim()
}
