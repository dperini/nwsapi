import { runTasks } from '../lib/task.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

export function checkCode(run = runNode) {
  runTasks('check', [], run)
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: pnpm run check [--all]. Runs subject/check.mts files and foo:check commands once.',
    )
  } else {
    if (process.argv.slice(2).some(arg => arg !== '--all')) {
      throw new Error('Usage: pnpm run check [--all]')
    }
    checkCode()
  }
}
