import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  foreignPackageManagerMessage,
  invokedByForeignPackageManager,
  invokingPackageManager,
} from './lib/package-manager.mts'
import {
  COMPILE_CACHE_DIR,
  COVERAGE_SCRIPT_PATH,
  REPO_ROOT,
} from './lib/paths.mts'

const [entry, ...args] = process.argv.slice(2)
if (invokedByForeignPackageManager()) {
  console.error(
    foreignPackageManagerMessage(
      invokingPackageManager(),
      process.env.npm_lifecycle_event,
    ),
  )
  process.exit(1)
}
if (!entry) {
  throw new Error('Usage: node scripts/run.mts <entry> [arguments]')
}

// Node reads these at startup; descendants inherit the same cache and opt-out.
const filename = path.resolve(REPO_ROOT, entry)
process.env.NODE_COMPILE_CACHE ||= COMPILE_CACHE_DIR
const coverage =
  filename === COVERAGE_SCRIPT_PATH ||
  args.some(
    arg =>
      arg === '--coverage' ||
      arg.startsWith('--coverage.') ||
      arg.startsWith('--coverage='),
  ) ||
  Boolean(process.env.NODE_V8_COVERAGE)
if (coverage) {
  process.env.NODE_DISABLE_COMPILE_CACHE = '1'
}
const child = spawnSync(process.execPath, [filename, ...args], {
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
