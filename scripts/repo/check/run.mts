import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core/primitives'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import { runTasks } from '../lib/task.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

export function checkCode(run = runNode) {
  runTasks('check', [], run)
}

if (isMainModule(import.meta.url)) {
  const options = runCli(
    object({ all: withDefault(flag('--all'), false) }),
    'check',
    process.argv.slice(2),
    {
      brief: message`Run repository check scripts and package check commands.`,
    },
  )
  if (options === HELP_SHOWN) {
    process.exitCode = 0
  } else {
    checkCode()
  }
}
