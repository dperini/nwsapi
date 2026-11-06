import { runTasks } from '../lib/task.mts'
import { isMainModule } from '../lib/run-node.mts'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core/primitives'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'

if (isMainModule(import.meta.url)) {
  const options = runCli(
    object({ check: withDefault(flag('--check'), false) }),
    'update',
    process.argv.slice(2),
    {
      brief: message`Run subject update scripts and package update commands once.`,
    },
  )
  if (options === HELP_SHOWN) {
    process.exitCode = 0
  } else {
    runTasks('update', options.check ? ['--check'] : [])
  }
}
