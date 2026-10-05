import { runTasks } from '../lib/task.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: pnpm run update [--check]. Runs subject/update.mts files and foo:update commands once.',
    )
  } else {
    if (process.argv.slice(2).some(arg => arg !== '--check')) {
      throw new Error('Usage: pnpm run update [--check]')
    }
    runTasks('update', process.argv.includes('--check') ? ['--check'] : [])
  }
}
