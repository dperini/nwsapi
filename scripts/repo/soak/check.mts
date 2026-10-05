import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run soak:check')
  } else {
    runNode(fileURLToPath(new URL('../soak.mts', import.meta.url)), ['--check'])
  }
}
