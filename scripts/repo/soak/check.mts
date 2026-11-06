import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'soak:check',
      process.argv.slice(2),
      message`Check the dependency soak policy.`,
    )
  ) {
    runNode(fileURLToPath(new URL('../soak.mts', import.meta.url)), ['--check'])
  }
}
