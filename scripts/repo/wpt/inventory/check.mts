import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../../lib/run-node.mts'
export * from '../../check/wpt/inventory.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run wpt-inventory:check')
  } else {
    runNode(
      fileURLToPath(new URL('../../check/wpt/inventory.mts', import.meta.url)),
      process.argv.slice(2),
    )
  }
}
