import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run memory:check')
  } else {
    runNode(
      fileURLToPath(new URL('../gen/memory-performance.mts', import.meta.url)),
      ['--check'],
    )
  }
}
