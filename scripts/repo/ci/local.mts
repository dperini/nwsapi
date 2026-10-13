import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { ensureLocalCiDocker } from './docker.mts'

export async function main() {
  await ensureLocalCiDocker()
  const runner = spawnSync(
    process.execPath,
    [
      'scripts/repo/run.mts',
      'node_modules/run-local-ci/dist/native-launcher.js',
      'run',
      '--workflow',
      '.github/workflows/ci.yml',
      '--quiet',
      '--pause-on-failure',
      '--github-token',
    ],
    { cwd: REPO_ROOT, env: process.env, stdio: 'inherit' },
  )
  if (runner.error) {
    throw runner.error
  }
  process.exitCode = runner.status ?? 1
}

if (isMainModule(import.meta.url)) {
  await main()
}
