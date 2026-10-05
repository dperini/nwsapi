import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run lint:check')
  } else {
    runNode(fileURLToPath(new URL('../lint.mts', import.meta.url)), [])
  }
}
