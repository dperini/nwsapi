import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { HELP_SHOWN, runForwardingCli } from '../../lib/cli/parser.mts'
import { isMainModule, runNode } from '../../lib/run-node.mts'
export * from '../../check/wpt/scope.mts'
export { default } from '../../check/wpt/scope.mts'

if (isMainModule(import.meta.url)) {
  const args = runForwardingCli(
    'wpt-scope:check',
    process.argv.slice(2),
    message`Check the WPT selector scope.`,
  )
  if (args !== HELP_SHOWN) {
    runNode(
      fileURLToPath(new URL('../../check/wpt/scope.mts', import.meta.url)),
      [...args.forwardedArgs],
      { externalGit: true },
    )
  }
}
