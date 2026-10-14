import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import type { Stats } from 'node:fs'

export type NativeSpawn = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; encoding: 'utf8' },
) => { status: number | null; stdout: string; stderr: string }

export function runNativeCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
  spawn: NativeSpawn = spawnSync,
) {
  const mergedEnvironment: NodeJS.ProcessEnv = { ...process.env, ...env }
  for (const [key, value] of Object.entries(mergedEnvironment)) {
    if (value === undefined) {
      delete mergedEnvironment[key]
    }
  }
  const result = spawn(command, args, {
    cwd,
    env: mergedEnvironment,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr}`,
    )
  }
  return result.stdout.trim()
}

export function nativeCacheSize(
  filename: string,
  stat: (filename: string) => Pick<Stats, 'size' | 'blocks'> = statSync,
) {
  const metadata = stat(filename)
  return {
    logicalBytes: metadata.size,
    physicalBytes: metadata.blocks * 512,
  }
}
