import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { HELP_SHOWN, runForwardingCli } from '../../lib/cli/parser.mts'
import { isMainModule, runNode } from '../../lib/run-node.mts'
export * from '../../check/wpt/inventory.mts'

if (isMainModule(import.meta.url)) {
  const args = runForwardingCli(
    'wpt-inventory:check',
    process.argv.slice(2),
    message`Check the pinned WPT test inventory.`,
  )
  if (args !== HELP_SHOWN) {
    runNode(
      fileURLToPath(new URL('../../check/wpt/inventory.mts', import.meta.url)),
      [...args.forwardedArgs],
      { externalGit: true },
    )
  }
}
