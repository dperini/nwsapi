import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import { ensureLocalCiDockerAvailable } from './docker.mts'

export function localCiInvocation() {
  return {
    command: 'node scripts/repo/ci/local/run.mts',
    args: [
      'scripts/repo/run.mts',
      'node_modules/run-local-ci/dist/native-launcher.js',
      'run',
      '--workflow',
      '.github/workflows/ci.yml',
      '--quiet',
      '--pause-on-failure',
      '--github-token',
    ],
  }
}

export async function main() {
  await ensureLocalCiDockerAvailable()
  const invocation = localCiInvocation()
  const runner = spawnSync(process.execPath, invocation.args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  })
  if (runner.error) {
    throw runner.error
  }
  process.exitCode = runner.status ?? 1
}

if (isMainModule(import.meta.url)) {
  await main()
}
