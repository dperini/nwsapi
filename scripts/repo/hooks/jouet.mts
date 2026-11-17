import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'

export const CLAUDE_HOOKS = [
  'session-start',
  'pre-tool-use',
  'post-tool-use',
  'post-edit',
  'post-tool-use-failure',
  'stop',
] as const

export type ClaudeHook = (typeof CLAUDE_HOOKS)[number]

export interface HookCommandResult {
  status: number | null
  error?: Error
}

export type HookCommandRunner = (
  command: string,
  args: string[],
  options: { stdio: 'inherit'; shell: boolean },
) => HookCommandResult

export function runJouetHook(
  hook: ClaudeHook,
  {
    root = REPO_ROOT,
    platform = process.platform,
    exists = existsSync,
    run = spawnSync,
  }: {
    root?: string
    platform?: NodeJS.Platform
    exists?: typeof existsSync
    run?: HookCommandRunner
  } = {},
) {
  const executable = path.join(
    root,
    '.cache/bin',
    platform === 'win32' ? 'jouet.cmd' : 'jouet',
  )
  if (!exists(executable)) {
    return 0
  }

  const result = run(executable, ['hook', 'claude', hook], {
    stdio: 'inherit',
    shell: platform === 'win32',
  })
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

if (isMainModule(import.meta.url)) {
  const hook = process.argv[2]
  if (!CLAUDE_HOOKS.includes(hook as ClaudeHook)) {
    throw new Error(
      `Expected one of these Claude hooks: ${CLAUDE_HOOKS.join(', ')}`,
    )
  }
  process.exitCode = runJouetHook(hook as ClaudeHook)
}
