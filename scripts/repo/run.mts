import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { invokedByForeignPackageManager } from './lib/package-manager.mts'
import { handoff } from './setup/manager.mts'
import {
  COMPILE_CACHE_DIR,
  COVERAGE_SCRIPT_PATH,
  REPO_ROOT,
} from './lib/paths.mts'
import { parseRunArgs, RUN_HELP } from './run/options.mts'

const request = parseRunArgs(process.argv.slice(2))
if (request.help) {
  console.log(RUN_HELP)
  process.exit(0)
}
const { args, entry } = request
// Node reads these at startup; descendants inherit the same cache and opt-out.
const filename = path.resolve(REPO_ROOT, entry)
process.env['NODE_COMPILE_CACHE'] ||= COMPILE_CACHE_DIR
const coverage =
  filename === COVERAGE_SCRIPT_PATH ||
  args.some(
    arg =>
      arg === '--coverage' ||
      arg.startsWith('--coverage.') ||
      arg.startsWith('--coverage='),
  ) ||
  Boolean(process.env['NODE_V8_COVERAGE'])
if (coverage) {
  process.env['NODE_DISABLE_COMPILE_CACHE'] = '1'
}
const child = invokedByForeignPackageManager()
  ? await handoff(filename, args)
  : spawnSync(process.execPath, [filename, ...args], {
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
