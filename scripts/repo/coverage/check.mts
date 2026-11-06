import { existsSync } from 'node:fs'
import { message } from '@optique/core/message'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    runHelpOnlyCli(
      'coverage:check',
      process.argv.slice(2),
      message`Check the generated coverage badge.`,
    )
  ) {
    process.exitCode = 0
  } else if (
    !existsSync(path.join(REPO_ROOT, 'coverage/coverage-summary.json'))
  ) {
    console.log(
      'coverage:check skipped; run pnpm run cover to generate coverage data.',
    )
  } else {
    runNode(
      fileURLToPath(new URL('../gen/coverage-badge.mts', import.meta.url)),
      ['--check'],
    )
  }
}
