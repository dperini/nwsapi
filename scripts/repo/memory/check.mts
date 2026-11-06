import { fileURLToPath } from 'node:url'
import { message } from '@optique/core/message'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'memory:check',
      process.argv.slice(2),
      message`Check memory benchmark baselines.`,
    )
  ) {
    runNode(
      fileURLToPath(new URL('../gen/memory-performance.mts', import.meta.url)),
      ['--check'],
    )
  }
}
