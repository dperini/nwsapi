import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run coverage:check')
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
