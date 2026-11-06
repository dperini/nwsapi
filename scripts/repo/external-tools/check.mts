import { message } from '@optique/core/message'
import { checkExternalTools } from '../external-tools.mts'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'external-tools:check',
      process.argv.slice(2),
      message`Verify pinned external tool metadata.`,
    )
  ) {
    checkExternalTools()
  }
}
