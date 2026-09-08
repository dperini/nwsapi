import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'

export function fuzzInvocation(args: string[], env = process.env) {
  const replay = args.includes('--replay')
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    VITIATE_FUZZ: replay ? '0' : '1',
  }
  if (replay) {
    for (const key of [
      'VITIATE_OPTIMIZE',
      'VITIATE_CLI_IPC',
      'VITIATE_SUPERVISOR',
      'VITIATE_SHMEM',
    ]) {
      delete childEnv[key]
    }
  }
  return {
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...args.filter(arg => arg !== '--replay'),
    ],
    env: childEnv,
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(
      'Usage: pnpm run test:fuzz [target] | pnpm run test:fuzz:replay [target]\nFUZZ_TIME_MS sets the per-target budget (default 15000). Replay uses the saved corpus and crash inputs.',
    )
  } else {
    const invocation = fuzzInvocation(args)
    const result = spawnSync(process.execPath, invocation.args, {
      cwd: REPO_ROOT,
      env: invocation.env,
      stdio: 'inherit',
    })
    if (result.error) {
      throw result.error
    }
    process.exitCode = result.status ?? 1
  }
}
