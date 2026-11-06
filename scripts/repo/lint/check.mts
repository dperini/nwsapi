import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'lint:check',
      process.argv.slice(2),
      message`Run lint checks for repository files.`,
    )
  ) {
    runNode(fileURLToPath(new URL('../lint.mts', import.meta.url)), [])
  }
}
