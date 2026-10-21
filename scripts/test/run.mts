import { readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { managedEnvironment } from '../lib/tools/setup.mjs'
import { REPO_ROOT, isMainModule } from '../lib/paths.mts'

export function testFiles(root = REPO_ROOT) {
  const directory = path.join(root, 'test/repo')
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.test\.(?:mjs|mts)$/.test(entry.name))
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort()
}

export function runTests(args = process.argv.slice(2)) {
  const result = spawnSync(
    process.execPath,
    ['--test', ...args, ...testFiles()],
    {
      cwd: REPO_ROOT,
      env: managedEnvironment(),
      stdio: 'inherit',
    },
  )
  if (result.error) {
    throw result.error
  }
  return result
}

if (isMainModule(import.meta.url)) {
  const result = runTests()
  process.exitCode = result.status ?? 1
}
