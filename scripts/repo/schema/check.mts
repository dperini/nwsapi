import { message } from '@optique/core/message'
import { generateSchemas } from './run.mts'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'schema:check',
      process.argv.slice(2),
      message`Check generated schemas for drift.`,
    )
  ) {
    generateSchemas(true)
  }
}
