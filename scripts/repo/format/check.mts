import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'format:check',
      process.argv.slice(2),
      message`Check formatting without changing files.`,
    )
  ) {
    runNode(fileURLToPath(new URL('../format.mts', import.meta.url)), [
      '--check',
    ])
  }
}
