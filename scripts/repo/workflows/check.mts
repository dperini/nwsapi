import { message } from '@optique/core/message'
import { checkInlineWorkflows } from '../check/workflows.mts'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'workflows:check',
      process.argv.slice(2),
      message`Check inline workflow configuration.`,
    )
  ) {
    checkInlineWorkflows()
  }
}
