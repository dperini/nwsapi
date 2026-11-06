import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { HELP_SHOWN, runForwardingCli } from '../../../lib/cli/parser.mts'
import { isMainModule, runNode } from '../../../lib/run-node.mts'
export * from '../../../check/wpt/native/contract.mts'

if (isMainModule(import.meta.url)) {
  const args = runForwardingCli(
    'wpt-native-contract:check',
    process.argv.slice(2),
    message`Check the native WPT contract artifacts.`,
  )
  if (args !== HELP_SHOWN) {
    runNode(
      fileURLToPath(
        new URL('../../../check/wpt/native/contract.mts', import.meta.url),
      ),
      ['--check', ...args.forwardedArgs],
      { externalGit: true },
    )
  }
}
