import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { invokedByForeignPackageManager } from './lib/package-manager.mts'
import { handoff, handoffCapture } from './setup/manager.mts'
import {
  COMPILE_CACHE_DIR,
  COVERAGE_SCRIPT_PATH,
  REPO_ROOT,
} from './lib/paths.mts'
import { parseRunArgs, RUN_HELP } from './run/options.mts'
import {
  clearExternalGitContext,
  isExternalWptRunner,
} from './lib/external-git-environment.mts'
import {
  commandResult,
  describeScript,
  formatScriptDescription,
} from './run/contract.mts'

const request = parseRunArgs(process.argv.slice(2))
if (request.help) {
  console.log(RUN_HELP)
  process.exit(0)
}
const { args, entry } = request
const childArgs = request.dryRun
  ? [...args, '--dry-run', ...(request.json ? ['--json'] : [])]
  : args
const description = describeScript(entry)
if (request.describe) {
  console.log(
    request.json
      ? JSON.stringify(description)
      : formatScriptDescription(description),
  )
  process.exit(0)
}
if (request.dryRun && !description.options.includes('--dry-run')) {
  throw new Error(`${entry} does not provide a dry-run plan.`)
}
// Node reads these at startup; descendants inherit the same cache and opt-out.
const filename = path.resolve(REPO_ROOT, entry)
if (isExternalWptRunner(filename, REPO_ROOT)) {
  clearExternalGitContext(process.env)
}
process.env['NODE_COMPILE_CACHE'] ||= COMPILE_CACHE_DIR
const coverage =
  filename === COVERAGE_SCRIPT_PATH ||
  childArgs.some(
    arg =>
      arg === '--coverage' ||
      arg.startsWith('--coverage.') ||
      arg.startsWith('--coverage='),
  ) ||
  Boolean(process.env['NODE_V8_COVERAGE'])
if (coverage) {
  process.env['NODE_DISABLE_COMPILE_CACHE'] = '1'
}
const foreignManager = invokedByForeignPackageManager()
if (request.json) {
  const child = foreignManager
    ? await handoffCapture(filename, childArgs)
    : spawnSync(process.execPath, [filename, ...childArgs], {
        cwd: REPO_ROOT,
        env: process.env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['inherit', 'pipe', 'pipe'],
      })
  const output = commandResult(entry, childArgs, {
    status: child.status,
    signal: child.signal,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    error: child.error,
  })
  console.log(JSON.stringify(output))
  if (child.signal) {
    process.kill(process.pid, child.signal)
  } else {
    process.exitCode = child.status ?? (child.error ? 1 : 0)
  }
} else {
  const child = foreignManager
    ? await handoff(filename, childArgs)
    : spawnSync(process.execPath, [filename, ...childArgs], {
        cwd: REPO_ROOT,
        env: process.env,
        stdio: 'inherit',
      })
  if (child.error) {
    throw child.error
  }
  if (child.signal) {
    process.kill(process.pid, child.signal)
  } else {
    process.exitCode = child.status ?? 1
  }
}
