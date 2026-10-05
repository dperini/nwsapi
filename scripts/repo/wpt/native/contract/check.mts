import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../../../lib/run-node.mts'
export * from '../../../check/wpt/native/contract.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run wpt-native-contract:check')
  } else {
    runNode(
      fileURLToPath(
        new URL('../../../check/wpt/native/contract.mts', import.meta.url),
      ),
      ['--check', ...process.argv.slice(2)],
    )
  }
}
