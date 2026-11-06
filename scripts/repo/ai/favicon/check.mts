import { message } from '@optique/core/message'
import { generateAgentFavicon } from '../../gen/ai/favicon.mts'
import { runHelpOnlyCli } from '../../lib/cli/parser.mts'
import { isMainModule } from '../../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'ai:favicon:check',
      process.argv.slice(2),
      message`Check the generated agent favicon.`,
    )
  ) {
    generateAgentFavicon(true)
  }
}
