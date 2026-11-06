import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core/primitives'
import { HELP_SHOWN, runCli } from './lib/cli/parser.mts'
import { checkCode } from './check.mts'
import {
  API_SCRIPT_PATH,
  SVG_CHECK_SCRIPT_PATH,
  FORMAT_SCRIPT_PATH,
  LINT_SCRIPT_PATH,
} from './lib/paths.mts'
import { isMainModule, runNode } from './lib/run-node.mts'

export function fixCode(run = runNode) {
  // Lint can apply fixes and still report errors. Format before the final check.
  try {
    run(LINT_SCRIPT_PATH, ['--fix'])
  } catch {
    // The final check reports any errors that formatting does not resolve.
  }
  run(FORMAT_SCRIPT_PATH, [])
  run(API_SCRIPT_PATH, [])
  run(SVG_CHECK_SCRIPT_PATH, ['--fix'])
  checkCode(run)
}

if (isMainModule(import.meta.url)) {
  const options = runCli(
    object({ all: withDefault(flag('--all'), false) }),
    'fix',
    process.argv.slice(2),
    {
      brief: message`Fix formatting, lint, generated API output, and SVGs.`,
    },
  )
  if (options === HELP_SHOWN) {
    process.exitCode = 0
  } else {
    fixCode()
  }
}
