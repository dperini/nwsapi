import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'api:check',
      process.argv.slice(2),
      message`Check the generated API documentation.`,
    )
  ) {
    runNode(
      fileURLToPath(new URL('../gen/api/markdown.mts', import.meta.url)),
      ['--check'],
    )
  }
}
