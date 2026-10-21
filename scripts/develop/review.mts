import { constants } from 'node:os'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from '../lib/external-tools.mjs'
import { managedEnvironment } from '../lib/tools/setup.mjs'
import { npmInvocation } from '../lib/npm.mjs'
import { runProcess } from './process.mts'

interface ReviewResult {
  code: number | null
  signal: NodeJS.Signals | null
}

type TestRunner = () => Promise<ReviewResult>

async function runNpmTest(): Promise<ReviewResult> {
  const invocation = npmInvocation(['test'])
  return runProcess(
    {
      command: invocation.command,
      args: invocation.args,
      cwd: REPO_ROOT,
      env: managedEnvironment(),
      shell: invocation.shell,
    },
    { interactive: true },
  )
}

export async function runReview(
  run: TestRunner = runNpmTest,
  now = () => performance.now(),
  log = console.log,
) {
  log('[review] Starting npm test.')
  const started = now()
  const result = await run()
  const elapsedMs = Math.round(now() - started)
  const outcome = result.signal
    ? `signal ${result.signal}`
    : `exit code ${result.code ?? 1}`
  log(`[review] npm test finished in ${elapsedMs}ms with ${outcome}.`)
  return result
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runReview()
  if (result.signal) {
    process.exitCode = 128 + (constants.signals[result.signal] ?? 1)
  } else {
    process.exitCode = result.code ?? 1
  }
}
