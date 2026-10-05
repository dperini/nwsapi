import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../../lib/run-node.mts'
export * from '../../check/wpt/candidates.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run wpt-candidates:check')
  } else {
    runNode(
      fileURLToPath(new URL('../../check/wpt/candidates.mts', import.meta.url)),
      process.argv.slice(2),
    )
  }
}
