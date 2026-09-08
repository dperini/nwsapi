import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from './paths.mts'
import { isAgent } from './is-agent.mts'

// Human sessions keep progress; agents receive diagnostics only on failure.
export function runTool(args: string[]) {
  const minimal = isAgent()
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: minimal ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (minimal && (result.error || result.status !== 0)) {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
  }
  if (result.error) {
    throw result.error
  }
  process.exitCode = result.status ?? 1
}
